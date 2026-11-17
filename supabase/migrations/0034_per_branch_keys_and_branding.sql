-- ============================================================
-- 0034_per_branch_keys_and_branding.sql   (Batch 4 — audit AUD-07 / AUD-21)
-- Apply BEFORE deploying the matching client (WorkforceController, HRController).
-- Safe: only replaces unique constraints with per-branch ones and adds columns.
--
-- 1. Keys that were unique across ALL restaurants become unique per branch, so a
--    second restaurant can have its own EMP-001, SKU or staff e-mail:
--    employees.employee_id, users.employment_number, users.email, products.sku,
--    payroll_summary (employee, month, year), attendance_logs (employee, day —
--    a constraint found only on production).
-- 2. employee_fingerprints and shift_rules get their own branch_id: their RLS used
--    to join on employee_id, which is no longer unique across branches.
-- 3. branch_settings gains business_name, currency and kitchen_whatsapp, and a
--    public profile function for customer pages (anon can't read branch_settings).
-- ============================================================

ALTER TABLE employees       DROP CONSTRAINT IF EXISTS employees_employee_id_key;
ALTER TABLE users           DROP CONSTRAINT IF EXISTS users_employment_number_key;
ALTER TABLE users           DROP CONSTRAINT IF EXISTS users_email_key;
ALTER TABLE products        DROP CONSTRAINT IF EXISTS products_sku_key;
ALTER TABLE payroll_summary DROP CONSTRAINT IF EXISTS payroll_summary_employee_id_month_year_key;
ALTER TABLE attendance_logs DROP CONSTRAINT IF EXISTS attendance_logs_employee_id_log_date_key;

CREATE UNIQUE INDEX IF NOT EXISTS ux_employees_branch_emp      ON employees (branch_id, employee_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_branch_empno        ON users (branch_id, employment_number);
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_branch_email        ON users (branch_id, lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS ux_products_branch_sku       ON products (branch_id, sku) WHERE sku IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_payroll_branch_emp_period ON payroll_summary (branch_id, employee_id, month, year);
CREATE UNIQUE INDEX IF NOT EXISTS ux_attendance_branch_emp_day ON attendance_logs (branch_id, employee_id, log_date);

-- Fingerprints: own branch_id (backfilled while employee_id is still unique).
ALTER TABLE employee_fingerprints ADD COLUMN IF NOT EXISTS branch_id TEXT;
UPDATE employee_fingerprints f SET branch_id = e.branch_id
  FROM employees e WHERE e.employee_id = f.employee_id AND f.branch_id IS NULL;
DROP POLICY IF EXISTS branch_isolation ON employee_fingerprints;
CREATE POLICY branch_isolation ON employee_fingerprints FOR ALL TO authenticated
  USING (branch_id = (SELECT public.current_device_branch()))
  WITH CHECK (branch_id = (SELECT public.current_device_branch()));

DO $$ BEGIN
  IF to_regclass('public.shift_rules') IS NOT NULL THEN
    ALTER TABLE shift_rules ADD COLUMN IF NOT EXISTS branch_id TEXT;
    UPDATE shift_rules s SET branch_id = e.branch_id FROM employees e
      WHERE e.employee_id = s.employee_id AND s.branch_id IS NULL;
    DROP POLICY IF EXISTS branch_isolation ON shift_rules;
    CREATE POLICY branch_isolation ON shift_rules FOR ALL TO authenticated
      USING (branch_id = (SELECT public.current_device_branch()))
      WITH CHECK (branch_id = (SELECT public.current_device_branch()));
  END IF;
END $$;

-- Per-branch branding.
ALTER TABLE branch_settings
  ADD COLUMN IF NOT EXISTS business_name    TEXT,
  ADD COLUMN IF NOT EXISTS currency         TEXT NOT NULL DEFAULT 'RM',
  ADD COLUMN IF NOT EXISTS kitchen_whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS pay_to           TEXT;

-- Public, read-only: the name and currency a customer page shows for a branch.
CREATE OR REPLACE FUNCTION public.branch_profile(p_branch_id TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'business_name', COALESCE(s.business_name, b.name),
    'currency', COALESCE(s.currency, 'RM'))
  FROM branches b LEFT JOIN branch_settings s ON s.branch_id = b.id
  WHERE b.id = p_branch_id;
$$;
REVOKE ALL ON FUNCTION public.branch_profile(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.branch_profile(TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
