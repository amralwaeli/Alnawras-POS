-- ============================================================
-- 0002 WORKFORCE RECONCILE — make prod match the application code
--
-- Phase-0 probing confirmed three runtime-breaking gaps in production:
--   1. employees is MISSING 7 columns the app reads/writes, so
--      WorkforceController.createEmployee() fails with a 400.
--   2. leave_requests does NOT EXIST, so every leave call 404s.
--   3. users.role CHECK does not include manager/supervisor/staff,
--      so creating those roles is rejected.
--
-- This migration is idempotent (IF NOT EXISTS / DROP IF EXISTS) and safe
-- to run multiple times. APPLY THIS to prod via the Supabase SQL Editor —
-- without it, the employee-create and leave features remain broken and
-- types.ts references columns prod lacks.
-- ============================================================

-- ─── 1. users: Rename 'position' to 'job_role' ───────────────
-- This fixes the reserved keyword conflict.
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'users' AND column_name = 'position') THEN
    ALTER TABLE users RENAME COLUMN "position" TO job_role;
  END IF;
END $$;

-- ─── 2. employees: add the columns the application requires ──
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS employee_number TEXT,
  ADD COLUMN IF NOT EXISTS email           TEXT,
  ADD COLUMN IF NOT EXISTS phone           TEXT,
  ADD COLUMN IF NOT EXISTS department      TEXT DEFAULT 'Operations',
  ADD COLUMN IF NOT EXISTS hire_date       DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS avatar_url      TEXT,
  ADD COLUMN IF NOT EXISTS notes           TEXT;

-- Back-fill employee_number from employee_id for any existing rows,
-- then enforce NOT NULL to match the application contract.
UPDATE employees SET employee_number = employee_id WHERE employee_number IS NULL;
ALTER TABLE employees ALTER COLUMN employee_number SET NOT NULL;

-- An admin must never be an employee (the app guards this in code too).
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_no_admin;
ALTER TABLE employees ADD  CONSTRAINT employees_no_admin CHECK (role <> 'admin');

-- ─── 3. users: extend the role CHECK to the full role set ────
-- UserRole in types.ts defines 11 roles. Includes 'swaiter' (Super Waiter) so
-- this constraint does not reject an existing swaiter row when re-applied to a
-- database that already carries app data (0006 also adds swaiter — same set).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD  CONSTRAINT users_role_check CHECK (role IN
  ('admin','cashier','waiter','swaiter','kitchen','hr','juice','staff','accounting','manager','supervisor'));

-- ─── 4. leave_requests: create the missing table ─────────────
CREATE TABLE IF NOT EXISTS leave_requests (
  id          TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  leave_type  TEXT NOT NULL CHECK (leave_type IN ('annual','sick','emergency','unpaid','other')),
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  days_count  INTEGER NOT NULL,
  reason      TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  branch_id   TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_employee ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_status   ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_branch   ON leave_requests(branch_id);

-- Reload PostgREST's schema cache so the new columns/table are visible.
NOTIFY pgrst, 'reload schema';
