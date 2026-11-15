-- ============================================================
-- 0027_shifts_and_attendance_hours.sql   (audit AUD-16 — schema drift)
--
-- Two things the application already reads/writes but that no migration ever
-- created. Confirmed missing on production (PostgREST 404 / 400):
--
--   shifts                       — ShiftController (open / end shift). Without
--                                  it, Shift Management errors on every action.
--   attendance_logs.total_hours  — HRController.recordScan writes it on
--                                  clock-out. Without it, every clock-out fails.
--
-- Additive & safe: creates one new table and one nullable column. No existing
-- row is touched. Idempotent. RLS is left OFF to match the other app tables
-- until the Auth + RLS cutover (the app would otherwise be locked out).
--
-- Run AFTER 0026.
-- ============================================================

CREATE TABLE IF NOT EXISTS shifts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- the app inserts without an id
  user_id      TEXT NOT NULL,
  user_name    TEXT,
  branch_id    TEXT NOT NULL,
  opened_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at    TIMESTAMPTZ,
  opening_cash DECIMAL(10,2) NOT NULL DEFAULT 0,
  closing_cash DECIMAL(10,2),
  total_sales  DECIMAL(10,2),
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed'))
);
CREATE INDEX IF NOT EXISTS idx_shifts_branch ON shifts(branch_id, opened_at);

-- One open shift per person per branch. getCurrentShift() expects at most one
-- row; a double-tap on "Open shift" would otherwise create two and break it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_shifts_one_open
  ON shifts(user_id, branch_id) WHERE status = 'open';

ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS total_hours NUMERIC(6,2);

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- ROLLBACK (manual). Only safe while `shifts` holds nothing you need.
--
--   DROP TABLE IF EXISTS shifts;
--   ALTER TABLE attendance_logs DROP COLUMN IF EXISTS total_hours;
--   NOTIFY pgrst, 'reload schema';
-- ============================================================
