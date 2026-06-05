-- ============================================================
-- Migration 001: Workforce Integration
-- Unifies Staff (users) + HR (employees) into one system.
--
-- SAFE TO RUN MULTIPLE TIMES (idempotent).
-- Run in Supabase SQL Editor (Dashboard → SQL Editor).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Extend employees table with missing columns
-- ────────────────────────────────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS employee_number  TEXT,
  ADD COLUMN IF NOT EXISTS email            TEXT,
  ADD COLUMN IF NOT EXISTS phone            TEXT,
  ADD COLUMN IF NOT EXISTS department       TEXT DEFAULT 'Operations',
  ADD COLUMN IF NOT EXISTS hire_date        DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS avatar_url       TEXT,
  ADD COLUMN IF NOT EXISTS notes            TEXT;

-- Back-fill employee_number from employee_id for existing rows
UPDATE employees
SET employee_number = employee_id
WHERE employee_number IS NULL;

-- Now make employee_number NOT NULL
ALTER TABLE employees
  ALTER COLUMN employee_number SET NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 2. Prevent admin from ever appearing in employees
-- ────────────────────────────────────────────────────────────
ALTER TABLE employees
  DROP CONSTRAINT IF EXISTS employees_no_admin;

ALTER TABLE employees
  ADD CONSTRAINT employees_no_admin CHECK (role <> 'admin');

-- ────────────────────────────────────────────────────────────
-- 3. Create leave_requests table
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_requests (
  id           TEXT PRIMARY KEY,
  employee_id  TEXT NOT NULL,
  leave_type   TEXT NOT NULL CHECK (leave_type IN ('annual','sick','emergency','unpaid','other')),
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  days_count   INTEGER NOT NULL,
  reason       TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected')),
  reviewed_by  TEXT,
  reviewed_at  TIMESTAMPTZ,
  branch_id    TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- 4. Performance indexes
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_emp_user_id    ON employees(user_id);
CREATE INDEX IF NOT EXISTS idx_emp_status     ON employees(status);
CREATE INDEX IF NOT EXISTS idx_emp_branch     ON employees(branch_id);
CREATE INDEX IF NOT EXISTS idx_emp_role       ON employees(role);

CREATE INDEX IF NOT EXISTS idx_att_employee   ON attendance_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_att_date       ON attendance_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_att_branch     ON attendance_logs(branch_id);

CREATE INDEX IF NOT EXISTS idx_fp_employee    ON employee_fingerprints(employee_id);
CREATE INDEX IF NOT EXISTS idx_fp_active      ON employee_fingerprints(is_active);

CREATE INDEX IF NOT EXISTS idx_pay_employee   ON payroll_summary(employee_id);
CREATE INDEX IF NOT EXISTS idx_pay_period     ON payroll_summary(month, year);

CREATE INDEX IF NOT EXISTS idx_leave_employee ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_status   ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_branch   ON leave_requests(branch_id);
