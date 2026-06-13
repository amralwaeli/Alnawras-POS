-- ============================================================
-- 0003 BACKFILL employees ← users   (DATA migration — OPTIONAL)
--
-- Salvaged from the old migration 002, which could never succeed because
-- the target columns did not exist until 0002. Run AFTER 0002.
--
-- This INSERTS one employee row per non-admin user that does not already
-- have one, so the (currently empty) employees table reflects existing
-- staff. It writes data — review before running. Idempotent: re-running
-- inserts nothing new (guarded by NOT EXISTS + ON CONFLICT).
-- ============================================================

INSERT INTO employees (
  id, user_id, employee_id, employee_number, full_name, email, role,
  department, hire_date, monthly_salary, shift_start, shift_end,
  early_checkin_minutes, late_checkout_minutes, status, branch_id,
  created_at, updated_at
)
SELECT
  'emp-migrated-' || u.id,
  u.id,
  u.employment_number,
  u.employment_number,
  u.name,
  u.email,
  u.role,
  CASE
    WHEN u.role IN ('kitchen','juice') THEN 'Kitchen'
    WHEN u.role = 'cashier'            THEN 'Cashier'
    WHEN u.role = 'waiter'             THEN 'Service'
    WHEN u.role = 'hr'                 THEN 'HR'
    WHEN u.role = 'accounting'         THEN 'Finance'
    WHEN u.role IN ('manager','supervisor') THEN 'Management'
    ELSE 'Operations'
  END,
  COALESCE(u.hire_date::DATE, u.created_at::DATE),
  COALESCE(u.hourly_rate * 160, 0),
  '09:00',
  '18:00',
  5,
  5,
  u.status,
  u.branch_id,
  u.created_at,
  NOW()
FROM users u
WHERE u.role <> 'admin'
  AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.user_id = u.id)
ON CONFLICT (employee_id) DO NOTHING;
