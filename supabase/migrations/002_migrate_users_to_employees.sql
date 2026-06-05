-- ============================================================
-- Migration 002: Backfill existing users → employees
--
-- Copies every non-admin user from the users table into
-- employees, linking them via employees.user_id.
--
-- SAFE TO RUN MULTIPLE TIMES (ON CONFLICT DO NOTHING).
-- Run AFTER migration 001.
-- ============================================================

INSERT INTO employees (
  id,
  user_id,
  employee_id,
  employee_number,
  full_name,
  email,
  role,
  department,
  hire_date,
  monthly_salary,
  shift_start,
  shift_end,
  early_checkin_minutes,
  late_checkout_minutes,
  status,
  branch_id,
  created_at,
  updated_at
)
SELECT
  'emp-migrated-' || u.id                                   AS id,
  u.id                                                      AS user_id,
  u.employment_number                                       AS employee_id,
  u.employment_number                                       AS employee_number,
  u.name                                                    AS full_name,
  u.email                                                   AS email,
  u.role                                                    AS role,
  CASE
    WHEN u.role IN ('kitchen', 'juice') THEN 'Kitchen'
    WHEN u.role = 'cashier'             THEN 'Cashier'
    WHEN u.role = 'waiter'              THEN 'Service'
    WHEN u.role = 'hr'                  THEN 'HR'
    WHEN u.role = 'accounting'          THEN 'Finance'
    WHEN u.role = 'manager'             THEN 'Management'
    WHEN u.role = 'supervisor'          THEN 'Management'
    ELSE 'Operations'
  END                                                       AS department,
  COALESCE(u.hire_date::DATE, u.created_at::DATE)           AS hire_date,
  COALESCE(u.hourly_rate * 160, 0)                          AS monthly_salary,
  '09:00'                                                   AS shift_start,
  '18:00'                                                   AS shift_end,
  5                                                         AS early_checkin_minutes,
  5                                                         AS late_checkout_minutes,
  u.status                                                  AS status,
  u.branch_id                                               AS branch_id,
  u.created_at                                              AS created_at,
  NOW()                                                     AS updated_at
FROM users u
WHERE u.role <> 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.user_id = u.id
  )
ON CONFLICT (employee_id) DO NOTHING;

-- ── Verification query ───────────────────────────────────────
-- Run this after the migration to confirm counts match.
--
-- SELECT
--   (SELECT COUNT(*) FROM users WHERE role <> 'admin') AS users_to_migrate,
--   (SELECT COUNT(*) FROM employees WHERE user_id IS NOT NULL) AS employees_linked;
--
-- Both numbers should be equal (or employees_linked >= users_to_migrate
-- if some employees were already manually created with a user_id link).
