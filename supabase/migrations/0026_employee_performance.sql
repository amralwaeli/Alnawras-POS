-- ============================================================
-- 0026_employee_performance.sql   (AI-assisted performance observations)
--
-- EXTENDS the existing HR system. It does NOT create a second employee store:
-- every observation points at an EXISTING row in `employees` through the same
-- business key the rest of HR uses (`employees.employee_id`, e.g. "EMP-007") —
-- exactly like attendance_logs.employee_id and payroll_summary.employee_id.
--
-- What is NOT stored here (it is computed live from existing tables instead,
-- so there is no duplicated data to drift):
--   * attendance / punctuality   → attendance_logs (unchanged)
--   * orders handled / tables    → order_items.added_by → employees.user_id
--   * payments processed         → order_payments.cashier_id → employees.user_id
--
-- What IS stored here: discrete events that have no existing home —
--   * AI CCTV observations (service response, table attendance, table
--     cleaning turnaround), which ALWAYS arrive as 'pending' manager review;
--   * customer complaints / compliments logged by a manager;
--   * manager evaluations.
--
-- Guarantees enforced IN THE DATABASE (not just the UI), by trigger/CHECK:
--   1. An observation can only name an employee that exists in `employees`
--      AND belongs to the same branch. Unknown/foreign ids are rejected.
--      AI events with no reliable identification stay unattributed (NULL).
--   2. AI CCTV observations are forced to review_status='pending' on insert,
--      whatever the caller sends — they never count until a human verifies.
--   3. AI observations must carry evidence (camera/clip reference etc.), and
--      evidence is immutable after insert (audit integrity).
--   4. A manager correcting the employee keeps the AI's original attribution
--      in original_employee_id (audit trail).
--   5. Verified/corrected rows must name an employee and a reviewer.
--
-- Nothing in this table is read by payroll (HRController.computePayroll) —
-- observations are advisory and never drive salary or disciplinary action.
--
-- Safety: purely additive. No existing table, column, constraint or row is
-- touched. No FK to employees on purpose: employees.employee_id's UNIQUE
-- constraint is "[type inferred]" in 0001 and unverified on prod, and an FK
-- would fail to create without it — the trigger enforces existence instead.
-- RLS: left OFF to match every other app table until Phase 1D (see TODO_1D.md);
-- the app's anon-key PIN sessions would otherwise be locked out.
--
-- Reversible: see the ROLLBACK block at the bottom.
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_performance_observations (
  id                   TEXT PRIMARY KEY,
  employee_id          TEXT,                 -- employees.employee_id; NULL = unattributed
  original_employee_id TEXT,                 -- AI's attribution before a manager correction
  branch_id            TEXT NOT NULL,
  source               TEXT NOT NULL CHECK (source IN ('ai_cctv','manager','customer')),
  category             TEXT NOT NULL CHECK (category IN (
                         'service_response',     -- seconds from guest signal to staff arrival
                         'table_attendance',     -- a table visit / check-back
                         'table_cleaning',       -- minutes from guest leaving to table reset
                         'customer_complaint',
                         'customer_compliment',
                         'manager_evaluation',   -- metric_value = rating 1..5
                         'other')),
  observed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metric_value         NUMERIC,
  metric_unit          TEXT CHECK (metric_unit IS NULL OR metric_unit IN ('seconds','minutes','rating','count')),
  summary              TEXT NOT NULL,
  evidence             JSONB,                -- e.g. {"camera_id":"cam-3","clip_ref":"...","table_id":"t-4"}
  confidence           NUMERIC CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  review_status        TEXT NOT NULL DEFAULT 'pending'
                         CHECK (review_status IN ('pending','verified','corrected','dismissed')),
  reviewed_by          TEXT,                 -- users.id of the reviewing manager/HR
  reviewed_at          TIMESTAMPTZ,
  review_note          TEXT,
  created_by           TEXT,                 -- users.id, or the integration name for AI
  created_at           TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT epo_ai_requires_evidence CHECK (
    source <> 'ai_cctv' OR (evidence IS NOT NULL AND evidence <> '{}'::jsonb)),
  CONSTRAINT epo_reviewed_requires_reviewer CHECK (
    review_status = 'pending' OR reviewed_by IS NOT NULL),
  CONSTRAINT epo_counted_requires_employee CHECK (
    review_status NOT IN ('verified','corrected') OR employee_id IS NOT NULL),
  CONSTRAINT epo_rating_range CHECK (
    category <> 'manager_evaluation' OR (metric_value BETWEEN 1 AND 5))
);

CREATE INDEX IF NOT EXISTS idx_epo_employee_time ON employee_performance_observations(employee_id, observed_at);
CREATE INDEX IF NOT EXISTS idx_epo_branch_status ON employee_performance_observations(branch_id, review_status);
CREATE INDEX IF NOT EXISTS idx_epo_branch_time   ON employee_performance_observations(branch_id, observed_at);

CREATE OR REPLACE FUNCTION public.epo_validate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- (1) Employee must exist in the existing HR table, in the same branch.
  IF NEW.employee_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM employees e
        WHERE e.employee_id = NEW.employee_id
          AND e.branch_id   = NEW.branch_id) THEN
    RAISE EXCEPTION 'employee % does not exist in branch %', NEW.employee_id, NEW.branch_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- (2) AI observations always start in the manager review queue.
    IF NEW.source = 'ai_cctv' THEN
      NEW.review_status        := 'pending';
      NEW.reviewed_by          := NULL;
      NEW.reviewed_at          := NULL;
      NEW.original_employee_id := NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  -- (3) Evidence and provenance are immutable.
  IF NEW.evidence IS DISTINCT FROM OLD.evidence
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
    RAISE EXCEPTION 'evidence, source and branch of an observation cannot be changed';
  END IF;

  -- (4) Keep the original attribution the first time a reviewer changes it.
  IF NEW.employee_id IS DISTINCT FROM OLD.employee_id AND OLD.original_employee_id IS NULL THEN
    NEW.original_employee_id := COALESCE(OLD.employee_id, '(unattributed)');
  ELSE
    NEW.original_employee_id := OLD.original_employee_id;
  END IF;

  IF NEW.review_status <> OLD.review_status AND NEW.review_status <> 'pending' THEN
    NEW.reviewed_at := COALESCE(NEW.reviewed_at, NOW());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_epo_validate ON employee_performance_observations;
CREATE TRIGGER trg_epo_validate
  BEFORE INSERT OR UPDATE ON employee_performance_observations
  FOR EACH ROW EXECUTE FUNCTION public.epo_validate();

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- ROLLBACK (run manually to fully reverse this migration).
-- Safe: nothing else references this table, and no existing HR data
-- (employees, attendance_logs, payroll_summary, leave_requests) is affected.
--
--   DROP TRIGGER  IF EXISTS trg_epo_validate ON employee_performance_observations;
--   DROP FUNCTION IF EXISTS public.epo_validate();
--   DROP TABLE    IF EXISTS employee_performance_observations;
--   NOTIFY pgrst, 'reload schema';
-- ============================================================
