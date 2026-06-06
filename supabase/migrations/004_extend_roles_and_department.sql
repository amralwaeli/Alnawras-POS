-- ============================================================
-- Migration 004: Extend users role constraint + ensure department column
--
-- Run this in Supabase SQL Editor to unlock all workforce roles
-- (accounting, manager, supervisor, juice, staff) and ensure the
-- department column exists on the employees table.
--
-- After running this migration, update ROLES in EmployeeFormModal.tsx
-- to re-add the extended roles.
-- ============================================================

-- 1. Drop the old role constraint and create an extended one
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'admin', 'cashier', 'waiter', 'kitchen', 'hr',
    'accounting', 'manager', 'supervisor', 'juice', 'staff'
  ));

-- 2. Ensure department column exists on employees (idempotent)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS department TEXT DEFAULT 'Operations';

-- 3. Reload PostgREST schema cache so the department column is visible
NOTIFY pgrst, 'reload schema';
