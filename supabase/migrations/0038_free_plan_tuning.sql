-- ============================================================
-- 0038_free_plan_tuning.sql   (2026-11-21)
--
-- Keeps the project comfortably inside the Supabase Free plan:
--  * Removes leftover hand-made policies on the HR tables; the per-branch
--    policies from 0032 remain the only rules there.
--  * current_device_branch() is STABLE (same answer within a statement), so
--    calls inside functions are evaluated once.
--  * Adds indexes for the hot paths (sales summary, open bill per table,
--    bill close, reports) and drops 16 duplicate indexes that cost space and
--    write time on every row.
--  * debt_account_summary() computes balances in one pass.
-- Safe to re-run. Apply BEFORE deploying the matching client.
-- ============================================================

DROP POLICY IF EXISTS "Allow all for employees"    ON employees;
DROP POLICY IF EXISTS "Allow all for fingerprints" ON employee_fingerprints;
DROP POLICY IF EXISTS "Allow all for attendance"   ON attendance_logs;
DROP POLICY IF EXISTS "Allow all for shift_rules"  ON shift_rules;
DROP POLICY IF EXISTS "Allow all for payroll"      ON payroll_summary;

ALTER FUNCTION public.current_device_branch() STABLE;

-- Indexes (each skipped quietly where a table/column doesn't exist on an older install).
DO $$
DECLARE stmt TEXT;
BEGIN
  FOREACH stmt IN ARRAY ARRAY[
    'CREATE INDEX IF NOT EXISTS idx_orders_branch_completed ON orders (branch_id, completed_at) WHERE status = ''completed''',
    'CREATE INDEX IF NOT EXISTS idx_orders_open_table ON orders (table_id) WHERE status = ''open''',
    'CREATE INDEX IF NOT EXISTS idx_order_groups_active_order ON order_groups (order_id) WHERE status = ''active''',
    'CREATE INDEX IF NOT EXISTS idx_order_payments_branch_time ON order_payments (branch_id, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_expenses_branch_date ON expenses (branch_id, date)',
    'CREATE INDEX IF NOT EXISTS idx_loyalty_branch_time ON loyalty_transactions (branch_id, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_loyalty_order ON loyalty_transactions (order_id)',
    'CREATE INDEX IF NOT EXISTS idx_audit_branch_time ON audit_logs (branch_id, created_at)']
  LOOP
    BEGIN EXECUTE stmt;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
    END;
  END LOOP;
END $$;

-- Duplicates: each repeats another index exactly, or the leading columns of a unique one.
DROP INDEX IF EXISTS idx_audit_logs_branch, idx_order_items_order_id, idx_guest_sessions_token,
  idx_pickup_tokens_token, idx_qr_sessions_token, idx_qr_sessions_active_table, idx_tables_qr_token,
  idx_att_date, idx_att_employee, idx_att_branch, idx_fp_employee, idx_pay_employee, idx_pay_period,
  idx_customers_phone_branch, idx_customers_branch, idx_emp_branch, idx_pmg_product;

CREATE OR REPLACE FUNCTION public.debt_account_summary(p_branch_id TEXT, p_tz TEXT DEFAULT 'Asia/Kuala_Lumpur')
RETURNS TABLE (
  id TEXT, name TEXT, phone TEXT, terms TEXT, credit_limit NUMERIC, notes TEXT, is_active BOOLEAN,
  balance NUMERIC, oldest_unpaid_at TIMESTAMPTZ, due_date DATE, overdue BOOLEAN, last_payment_at TIMESTAMPTZ
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);
  RETURN QUERY
  WITH e AS (SELECT * FROM debt_entries de WHERE de.branch_id = p_branch_id),
  -- One pass per account: balance, money paid/forgiven, last payment.
  agg AS (
    SELECT e.account_id,
           SUM(CASE WHEN e.kind = 'payment' THEN -e.amount ELSE e.amount END) AS bal,
           SUM(CASE WHEN e.kind = 'payment' THEN e.amount WHEN e.kind = 'adjustment' AND e.amount < 0 THEN -e.amount ELSE 0 END) AS paid,
           MAX(e.created_at) FILTER (WHERE e.kind = 'payment') AS last_pay
      FROM e GROUP BY e.account_id),
  debit AS (
    SELECT e.account_id, e.created_at,
           SUM(e.amount) OVER (PARTITION BY e.account_id ORDER BY e.created_at, e.id) AS running
      FROM e WHERE e.kind = 'charge' OR (e.kind = 'adjustment' AND e.amount > 0)),
  oldest AS (
    SELECT d.account_id, MIN(d.created_at) AS at FROM debit d LEFT JOIN agg c ON c.account_id = d.account_id
     WHERE d.running > COALESCE(c.paid, 0) + 0.005 GROUP BY d.account_id),
  s AS (
    SELECT a.*, COALESCE(g.bal, 0) AS bal, o.at AS oldest_at, g.last_pay
      FROM debt_accounts a LEFT JOIN agg g ON g.account_id = a.id LEFT JOIN oldest o ON o.account_id = a.id
     WHERE a.branch_id = p_branch_id)
  SELECT s.id, s.name, s.phone, s.terms, s.credit_limit, s.notes, s.is_active, s.bal,
         CASE WHEN s.bal > 0.005 THEN s.oldest_at END,
         CASE WHEN s.bal > 0.005 AND s.oldest_at IS NOT NULL THEN
           ((s.oldest_at AT TIME ZONE p_tz) + CASE s.terms WHEN 'weekly' THEN interval '7 days' WHEN 'monthly' THEN interval '1 month' END)::date END,
         COALESCE(s.bal > 0.005 AND s.terms <> 'flexible' AND s.oldest_at IS NOT NULL AND
           ((s.oldest_at AT TIME ZONE p_tz) + CASE s.terms WHEN 'weekly' THEN interval '7 days' ELSE interval '1 month' END)::date
             < (NOW() AT TIME ZONE p_tz)::date, false),
         s.last_pay
    FROM s ORDER BY s.name;
END; $$;
REVOKE ALL ON FUNCTION public.debt_account_summary(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.debt_account_summary(TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ROLLBACK (manual): indexes can be recreated from pg_indexes history; re-run 0036 for
-- debt_account_summary; ALTER FUNCTION public.current_device_branch() VOLATILE;
