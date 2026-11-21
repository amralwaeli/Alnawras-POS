-- ============================================================
-- 0036_customer_debt_accounts.sql   (owner decisions of 2026-11-17)
--
-- Customers who pay later (weekly, monthly or "flexible"):
--  * debt_accounts   — one per customer: terms, optional credit limit.
--  * debt_entries    — append-only ledger: charge (a bill put on account),
--                      payment (money collected), adjustment (correction, ±).
--  * pay_order accepts the method 'account' (with account_id) for the whole bill
--    or the part not paid in cash/card/QR. The bill counts as a sale on its day
--    (method ACCOUNT); later debt payments are collections, not new sales.
--  * Charging past the account's credit limit is refused.
--  * debt_account_summary(): balance, oldest unpaid charge, due date and
--    overdue flag (weekly = 7 days, monthly = 1 month after the oldest unpaid
--    charge; flexible = no due date).
-- Additive. Apply BEFORE deploying the matching client.
-- ============================================================

CREATE TABLE IF NOT EXISTS debt_accounts (
  id           TEXT PRIMARY KEY DEFAULT ('debt-' || gen_random_uuid()),
  branch_id    TEXT NOT NULL,
  name         TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  phone        TEXT CHECK (phone IS NULL OR length(phone) <= 40),
  terms        TEXT NOT NULL DEFAULT 'flexible' CHECK (terms IN ('weekly', 'monthly', 'flexible')),
  credit_limit NUMERIC(12,2) CHECK (credit_limit IS NULL OR credit_limit >= 0),
  notes        TEXT CHECK (notes IS NULL OR length(notes) <= 500),
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_debt_accounts_branch ON debt_accounts (branch_id, name);
ALTER TABLE debt_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS branch_isolation ON debt_accounts;
CREATE POLICY branch_isolation ON debt_accounts FOR ALL TO authenticated
  USING (branch_id = (SELECT public.current_device_branch()))
  WITH CHECK (branch_id = (SELECT public.current_device_branch()));
REVOKE ALL ON debt_accounts FROM anon;

CREATE TABLE IF NOT EXISTS debt_entries (
  id              TEXT PRIMARY KEY DEFAULT ('dent-' || gen_random_uuid()),
  branch_id       TEXT NOT NULL,
  account_id      TEXT NOT NULL REFERENCES debt_accounts(id) ON DELETE RESTRICT,  -- an account with history can't be deleted
  kind            TEXT NOT NULL CHECK (kind IN ('charge', 'payment', 'adjustment')),
  amount          NUMERIC(12,2) NOT NULL CHECK (amount <> 0 AND (kind = 'adjustment' OR amount > 0)),
  method          TEXT CHECK (method IS NULL OR method IN ('cash', 'card', 'qr', 'transfer')),
  order_id        TEXT,
  note            TEXT CHECK (note IS NULL OR length(note) <= 300),
  created_by      TEXT,
  created_by_name TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_debt_entries_account ON debt_entries (account_id, created_at);
CREATE INDEX IF NOT EXISTS idx_debt_entries_branch_time ON debt_entries (branch_id, created_at);
ALTER TABLE debt_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS branch_read ON debt_entries;
CREATE POLICY branch_read ON debt_entries FOR SELECT TO authenticated
  USING (branch_id = (SELECT public.current_device_branch()));
REVOKE ALL ON debt_entries FROM anon;
REVOKE INSERT, UPDATE, DELETE ON debt_entries FROM authenticated;   -- written only by the functions below

-- What the customer owes now (positive = owes us).
CREATE OR REPLACE FUNCTION public._debt_balance(p_account_id TEXT)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(CASE WHEN e.kind = 'payment' THEN -e.amount ELSE e.amount END), 0)
    FROM debt_entries e WHERE e.account_id = p_account_id;
$$;
REVOKE ALL ON FUNCTION public._debt_balance(TEXT) FROM PUBLIC, anon, authenticated;

-- Locks the account so two tills can't both slip under the limit.
CREATE OR REPLACE FUNCTION public._charge_debt_account(
  p_branch_id TEXT, p_account_id TEXT, p_amount NUMERIC, p_order_id TEXT, p_bill TEXT, p_by TEXT, p_by_name TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_acc debt_accounts%ROWTYPE; v_bal NUMERIC;
BEGIN
  SELECT * INTO v_acc FROM debt_accounts a WHERE a.id = p_account_id AND a.branch_id = p_branch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer account not found'; END IF;
  IF NOT v_acc.is_active THEN RAISE EXCEPTION 'The account of % is closed', v_acc.name; END IF;
  v_bal := public._debt_balance(p_account_id);
  IF v_acc.credit_limit IS NOT NULL AND v_bal + p_amount > v_acc.credit_limit + 0.005 THEN
    RAISE EXCEPTION '% already owes % — this bill would pass the credit limit of %',
      v_acc.name, to_char(v_bal, 'FM999999990.00'), to_char(v_acc.credit_limit, 'FM999999990.00');
  END IF;
  INSERT INTO debt_entries (branch_id, account_id, kind, amount, order_id, note, created_by, created_by_name)
  VALUES (p_branch_id, p_account_id, 'charge', p_amount, p_order_id, 'Bill ' || p_bill, p_by, p_by_name);
END; $$;
REVOKE ALL ON FUNCTION public._charge_debt_account(TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pay_order(
  p_order_id      TEXT,
  p_branch_id     TEXT,
  p_payments      JSONB,              -- [{"method":"cash","amount":12.5}, …]; one entry may omit amount = the whole total
  p_discount      NUMERIC,            -- the till's discount (presets), before loyalty
  p_cashier_id    TEXT,
  p_cashier_name  TEXT,
  p_customer_id   UUID DEFAULT NULL,  -- loyalty customer, if linked
  p_redeem_points INT  DEFAULT 0
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  v_order     orders%ROWTYPE;
  v_set       branch_settings%ROWTYPE;
  v_loyal     JSONB;
  v_subtotal  NUMERIC;
  v_redeem_v  NUMERIC := 0;
  v_discount  NUMERIC;
  v_net       NUMERIC;
  v_tax       NUMERIC := 0;
  v_total     NUMERIC;
  v_pay       JSONB;
  v_paid_sum  NUMERIC := 0;
  v_lines     INT;
  v_bill      TEXT;
  v_summary   TEXT;
  v_first_pay TEXT;
  v_pay_id    TEXT;
  v_earned    INT := 0;
  v_accounts  INT := 0;
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);

  SELECT * INTO v_order FROM orders WHERE id = p_order_id AND branch_id = p_branch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status <> 'open' THEN RAISE EXCEPTION 'This bill has already been paid'; END IF;
  IF EXISTS (SELECT 1 FROM order_items WHERE order_id = p_order_id AND paid AND status IS DISTINCT FROM 'cancelled') THEN
    RAISE EXCEPTION 'This bill is partly paid by item — continue paying by item';
  END IF;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal
    FROM order_items WHERE order_id = p_order_id AND branch_id = p_branch_id AND status IS DISTINCT FROM 'cancelled';
  IF v_subtotal <= 0 THEN RAISE EXCEPTION 'Nothing to pay on this bill'; END IF;

  SELECT * INTO v_set FROM branch_settings WHERE branch_id = p_branch_id;
  v_loyal := COALESCE(v_set.loyalty, '{}'::jsonb);

  -- Loyalty redemption: in this transaction, or not at all.
  IF COALESCE(p_redeem_points, 0) > 0 THEN
    IF p_customer_id IS NULL THEN RAISE EXCEPTION 'Link a customer to redeem points'; END IF;
    IF NOT COALESCE((v_loyal->>'enabled')::boolean, true) THEN RAISE EXCEPTION 'Loyalty is switched off'; END IF;
    IF p_redeem_points < COALESCE((v_loyal->>'minimumRedemption')::int, 100) THEN
      RAISE EXCEPTION 'Need at least % points to redeem', COALESCE((v_loyal->>'minimumRedemption')::int, 100);
    END IF;
    PERFORM public._assert_customer_branch(p_customer_id, p_branch_id);
    IF NOT public._redeem_loyalty_points_impl(p_customer_id, p_order_id, p_redeem_points, p_branch_id) THEN
      RAISE EXCEPTION 'The customer does not have enough points';
    END IF;
    v_redeem_v := round(p_redeem_points::numeric / GREATEST(COALESCE((v_loyal->>'redemptionRate')::numeric, 100), 0.0001), 2);
  END IF;

  v_discount := LEAST(v_subtotal, round(GREATEST(COALESCE(p_discount, 0), 0) + v_redeem_v, 2));
  v_net      := v_subtotal - v_discount;
  IF COALESCE(v_set.tax_enabled, false) AND COALESCE(v_set.tax_rate, 0) > 0 AND v_net > 0 THEN
    v_tax := round(CASE WHEN v_set.tax_inclusive THEN v_net - v_net / (1 + v_set.tax_rate / 100)
                        ELSE v_net * v_set.tax_rate / 100 END, 2);
  END IF;
  v_total := CASE WHEN COALESCE(v_set.tax_inclusive, false) THEN v_net ELSE v_net + v_tax END;

  -- Payments must add up to the server's total. A fully discounted bill (total 0)
  -- closes with no payment rows.
  IF v_total > 0 THEN
  IF p_payments IS NULL OR jsonb_typeof(p_payments) <> 'array' THEN RAISE EXCEPTION 'No payment given'; END IF;
  v_lines := jsonb_array_length(p_payments);
  IF v_lines NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'Use one to three payment methods'; END IF;
  IF v_lines = 1 AND (p_payments->0->'amount' IS NULL OR jsonb_typeof(p_payments->0->'amount') = 'null') THEN
    p_payments := jsonb_build_array((p_payments->0) || jsonb_build_object('amount', v_total));  -- keeps account_id
  END IF;
  FOR v_pay IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    IF (v_pay->>'method') NOT IN ('cash', 'card', 'qr', 'account') THEN RAISE EXCEPTION 'Unknown payment method %', v_pay->>'method'; END IF;
    IF v_pay->>'method' = 'account' THEN
      v_accounts := v_accounts + 1;
      IF v_accounts > 1 THEN RAISE EXCEPTION 'Only one customer account per bill'; END IF;
      IF NULLIF(v_pay->>'account_id', '') IS NULL THEN RAISE EXCEPTION 'Choose the customer account'; END IF;
    END IF;
    IF COALESCE((v_pay->>'amount')::numeric, 0) <= 0 THEN RAISE EXCEPTION 'Each payment must be more than zero'; END IF;
    v_paid_sum := v_paid_sum + (v_pay->>'amount')::numeric;
  END LOOP;
  IF abs(v_paid_sum - v_total) > 0.005 THEN
    RAISE EXCEPTION 'Payments add up to % but the bill is %', round(v_paid_sum, 2), v_total;
  END IF;
  END IF;

  v_bill := COALESCE(v_order.bill_number, public._next_bill_number(p_branch_id, v_order.order_type));
  SELECT CASE WHEN v_total = 0 THEN 'NO CHARGE' WHEN v_lines = 1 THEN upper(p_payments->0->>'method')
              ELSE string_agg(upper(e->>'method') || ' ' || to_char((e->>'amount')::numeric, 'FM999999990.00'), ' + ') END
    INTO v_summary FROM jsonb_array_elements(p_payments) e;

  FOR v_pay IN SELECT * FROM jsonb_array_elements(CASE WHEN v_total > 0 THEN p_payments ELSE '[]'::jsonb END) LOOP
    v_pay_id := 'opay-' || substr(public._random_token(), 1, 20);
    v_first_pay := COALESCE(v_first_pay, v_pay_id);
    INSERT INTO order_payments (id, order_id, amount, method, item_ids, cashier_id, cashier_name, branch_id)
      VALUES (v_pay_id, p_order_id, round((v_pay->>'amount')::numeric, 2), v_pay->>'method', '[]'::jsonb,
              p_cashier_id, p_cashier_name, p_branch_id);
    IF v_pay->>'method' = 'account' THEN
      PERFORM public._charge_debt_account(p_branch_id, v_pay->>'account_id', round((v_pay->>'amount')::numeric, 2),
                                          p_order_id, v_bill, p_cashier_id, p_cashier_name);
    END IF;
  END LOOP;

  UPDATE order_items SET paid = true, paid_at = NOW(), payment_id = v_first_pay
    WHERE order_id = p_order_id AND status IS DISTINCT FROM 'cancelled';

  UPDATE orders SET status = 'completed', completed_at = NOW(), payment_status = 'paid',
         payment_method = v_summary, bill_number = v_bill,
         subtotal = v_subtotal, discount = v_discount, tax = v_tax, total = v_total,
         pickup_status = CASE WHEN order_type = 'pickup' THEN 'picked' ELSE pickup_status END
    WHERE id = p_order_id;              -- the 0029 trigger closes the table's guest party

  IF v_order.table_id IS NOT NULL THEN
    UPDATE tables SET status = 'available', current_order_id = NULL, ordering_enabled = false, needs_waiter = false
      WHERE id = v_order.table_id AND branch_id = p_branch_id;
    UPDATE qr_sessions SET active = false, last_activity_at = NOW() WHERE table_id = v_order.table_id;
  END IF;
  IF v_order.order_type = 'pickup' THEN
    UPDATE pickup_tokens SET active = false, status = 'completed' WHERE order_id = p_order_id;
  END IF;

  IF p_customer_id IS NOT NULL AND COALESCE((v_loyal->>'enabled')::boolean, true) THEN
    PERFORM public._assert_customer_branch(p_customer_id, p_branch_id);
    v_earned := floor(v_total * COALESCE((v_loyal->>'pointsPerDollar')::numeric, 1))::int;
    IF v_earned > 0 THEN
      PERFORM public._earn_loyalty_points_impl(p_customer_id, p_order_id, v_earned, v_total, p_branch_id);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'bill_number', v_bill, 'payment_summary', v_summary,
    'subtotal', v_subtotal, 'discount', v_discount, 'tax', v_tax, 'total', v_total,
    'points_redeemed', COALESCE(p_redeem_points, 0), 'points_earned', v_earned);
END; $$;
REVOKE ALL ON FUNCTION public.pay_order(TEXT, TEXT, JSONB, NUMERIC, TEXT, TEXT, UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_order(TEXT, TEXT, JSONB, NUMERIC, TEXT, TEXT, UUID, INT) TO authenticated;

-- Money collected against a debt. Returns the new balance.
CREATE OR REPLACE FUNCTION public.record_debt_payment(
  p_branch_id TEXT, p_account_id TEXT, p_amount NUMERIC, p_method TEXT, p_note TEXT, p_by TEXT, p_by_name TEXT
) RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_bal NUMERIC; v_amt NUMERIC := round(COALESCE(p_amount, 0), 2);
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);
  PERFORM 1 FROM debt_accounts a WHERE a.id = p_account_id AND a.branch_id = p_branch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer account not found'; END IF;
  IF v_amt <= 0 THEN RAISE EXCEPTION 'Enter an amount above zero'; END IF;
  IF p_method NOT IN ('cash', 'card', 'qr', 'transfer') THEN RAISE EXCEPTION 'Unknown payment method %', p_method; END IF;
  v_bal := public._debt_balance(p_account_id);
  IF v_amt > v_bal + 0.005 THEN
    RAISE EXCEPTION 'The customer owes only %', to_char(GREATEST(v_bal, 0), 'FM999999990.00');
  END IF;
  INSERT INTO debt_entries (branch_id, account_id, kind, amount, method, note, created_by, created_by_name)
  VALUES (p_branch_id, p_account_id, 'payment', v_amt, p_method, NULLIF(left(btrim(p_note), 300), ''), p_by, p_by_name);
  RETURN v_bal - v_amt;
END; $$;
REVOKE ALL ON FUNCTION public.record_debt_payment(TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_debt_payment(TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Correction (+ adds to the debt, − forgives part of it). A reason is required.
CREATE OR REPLACE FUNCTION public.adjust_debt(
  p_branch_id TEXT, p_account_id TEXT, p_amount NUMERIC, p_note TEXT, p_by TEXT, p_by_name TEXT
) RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_amt NUMERIC := round(COALESCE(p_amount, 0), 2);
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);
  PERFORM 1 FROM debt_accounts a WHERE a.id = p_account_id AND a.branch_id = p_branch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer account not found'; END IF;
  IF v_amt = 0 THEN RAISE EXCEPTION 'Enter an amount'; END IF;
  IF NULLIF(btrim(p_note), '') IS NULL THEN RAISE EXCEPTION 'Write the reason for the correction'; END IF;
  INSERT INTO debt_entries (branch_id, account_id, kind, amount, note, created_by, created_by_name)
  VALUES (p_branch_id, p_account_id, 'adjustment', v_amt, left(btrim(p_note), 300), p_by, p_by_name);
  RETURN public._debt_balance(p_account_id);
END; $$;
REVOKE ALL ON FUNCTION public.adjust_debt(TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_debt(TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;

-- One row per account: balance, oldest unpaid charge (payments settle the oldest first),
-- due date by terms, overdue flag.
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
  credit AS (
    SELECT e.account_id, SUM(CASE WHEN e.kind = 'payment' THEN e.amount ELSE -e.amount END) AS paid
      FROM e WHERE e.kind = 'payment' OR (e.kind = 'adjustment' AND e.amount < 0) GROUP BY e.account_id),
  debit AS (
    SELECT e.account_id, e.created_at,
           SUM(e.amount) OVER (PARTITION BY e.account_id ORDER BY e.created_at, e.id) AS running
      FROM e WHERE e.kind = 'charge' OR (e.kind = 'adjustment' AND e.amount > 0)),
  oldest AS (
    SELECT d.account_id, MIN(d.created_at) AS at FROM debit d LEFT JOIN credit c ON c.account_id = d.account_id
     WHERE d.running > COALESCE(c.paid, 0) + 0.005 GROUP BY d.account_id),
  s AS (
    SELECT a.*, public._debt_balance(a.id) AS bal, o.at AS oldest_at,
           (SELECT MAX(x.created_at) FROM e x WHERE x.account_id = a.id AND x.kind = 'payment') AS last_pay
      FROM debt_accounts a LEFT JOIN oldest o ON o.account_id = a.id
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

-- ============================================================
-- ROLLBACK (manual): re-run 0033 (pay_order), then
--   DROP FUNCTION IF EXISTS public.debt_account_summary(TEXT, TEXT), public.adjust_debt(TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT),
--     public.record_debt_payment(TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT),
--     public._charge_debt_account(TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT), public._debt_balance(TEXT);
--   DROP TABLE IF EXISTS debt_entries, debt_accounts;   -- ⚠ deletes every customer debt record
-- ============================================================
