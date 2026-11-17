-- ============================================================
-- 0033_payments_and_reports.sql   (Batch 3 — audit AUD-05/06/19/31)
--
--   pay_order(...)          Whole-bill payment as ONE locked transaction. Until
--                           now the till wrote the totals the browser computed,
--                           with no "still open?" guard (two tills could both
--                           take the same bill), wrote no payment rows, and did
--                           loyalty in separate calls whose failure was ignored.
--                           Now the server: refuses a bill that is not open or
--                           already part-paid by item; computes subtotal, tax and
--                           total itself; caps the discount at the subtotal;
--                           redeems loyalty points in the same transaction (no
--                           points, no discount); checks the payments add up;
--                           writes one order_payments row per method; frees the
--                           table; earns loyalty points.
--   void_order_item(...)    Voiding a sent line in one locked transaction (was
--                           three client writes with a client-computed total).
--   get_sales_summary(...)  Revenue / tax / discount / orders / items / expenses
--                           / by payment method / by day for ANY date range,
--                           counted by when the bill was PAID. Reports showed
--                           only "today", and Accounting subtracted all-time
--                           expenses from today's revenue.
--   customers: one customer per phone number per branch (digits only).
--
-- All three functions require the caller's own branch (0031's check).
-- Additive & safe. Apply AFTER 0032, BEFORE deploying the matching client.
-- ============================================================

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
    p_payments := jsonb_build_array(jsonb_build_object('method', p_payments->0->>'method', 'amount', v_total));
  END IF;
  FOR v_pay IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    IF (v_pay->>'method') NOT IN ('cash', 'card', 'qr') THEN RAISE EXCEPTION 'Unknown payment method %', v_pay->>'method'; END IF;
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

CREATE OR REPLACE FUNCTION public.void_order_item(
  p_item_id TEXT, p_order_id TEXT, p_branch_id TEXT,
  p_reason TEXT, p_actor_id TEXT, p_actor_name TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE v_status TEXT; v_sub NUMERIC;
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);
  SELECT status INTO v_status FROM orders WHERE id = p_order_id AND branch_id = p_branch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'Cannot void an item on a bill that has already been paid'; END IF;

  UPDATE order_items
     SET status = 'cancelled', cancelled_by = p_actor_id, cancelled_by_name = p_actor_name,
         cancel_reason = NULLIF(left(btrim(p_reason), 300), ''), cancelled_at = NOW()
   WHERE id = p_item_id AND order_id = p_order_id AND branch_id = p_branch_id
     AND NOT paid AND status IS DISTINCT FROM 'cancelled';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This item was already paid for or voided — it cannot be voided now.';
  END IF;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_sub FROM order_items
    WHERE order_id = p_order_id AND branch_id = p_branch_id AND status IS DISTINCT FROM 'cancelled';
  UPDATE orders SET subtotal = v_sub, tax = 0, total = v_sub WHERE id = p_order_id;
END; $$;

CREATE OR REPLACE FUNCTION public.get_sales_summary(
  p_branch_id TEXT, p_from TIMESTAMPTZ, p_to TIMESTAMPTZ, p_tz TEXT DEFAULT 'Asia/Kuala_Lumpur'
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tz TEXT := COALESCE(NULLIF(p_tz, ''), 'Asia/Kuala_Lumpur');
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);
  IF p_to <= p_from THEN RAISE EXCEPTION 'Invalid date range'; END IF;
  IF p_to - p_from > interval '400 days' THEN RAISE EXCEPTION 'Please choose a range of about a year or less'; END IF;
  PERFORM now() AT TIME ZONE v_tz;      -- rejects an unknown timezone name early

  RETURN (
    WITH done AS (
      SELECT o.id, o.total, o.tax, o.discount, o.order_type, o.completed_at
      FROM orders o
      WHERE o.branch_id = p_branch_id AND o.status = 'completed'
        AND o.completed_at >= p_from AND o.completed_at < p_to
    )
    SELECT jsonb_build_object(
      'revenue',  COALESCE((SELECT SUM(total) FROM done), 0),
      'tax',      COALESCE((SELECT SUM(tax) FROM done), 0),
      'discount', COALESCE((SELECT SUM(discount) FROM done), 0),
      'orders',   (SELECT COUNT(*) FROM done),
      'items',    COALESCE((SELECT SUM(oi.quantity) FROM order_items oi JOIN done d ON d.id = oi.order_id
                            WHERE oi.status IS DISTINCT FROM 'cancelled'), 0),
      'expenses', COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.branch_id = p_branch_id
                            AND e.date >= (p_from AT TIME ZONE v_tz)::date
                            AND e.date <= ((p_to - interval '1 millisecond') AT TIME ZONE v_tz)::date), 0),
      'by_type',  COALESCE((SELECT jsonb_object_agg(t, n) FROM (SELECT COALESCE(order_type, 'dine-in') t, COUNT(*) n FROM done GROUP BY 1) x), '{}'::jsonb),
      'by_method', COALESCE((SELECT jsonb_object_agg(m, a) FROM (
                     SELECT op.method m, SUM(op.amount) a FROM order_payments op JOIN done d ON d.id = op.order_id GROUP BY 1) x), '{}'::jsonb),
      'by_day',   COALESCE((SELECT jsonb_agg(jsonb_build_object('day', day, 'revenue', rev, 'orders', n) ORDER BY day) FROM (
                     SELECT to_char(completed_at AT TIME ZONE v_tz, 'YYYY-MM-DD') AS day, SUM(total) rev, COUNT(*) n
                     FROM done GROUP BY 1) x), '[]'::jsonb)
    ));
END; $$;

-- One customer per phone number per branch (compared on digits only).
CREATE UNIQUE INDEX IF NOT EXISTS ux_customers_branch_phone
  ON customers (branch_id, regexp_replace(phone, '\D', '', 'g'));

REVOKE ALL ON FUNCTION public.pay_order(TEXT, TEXT, JSONB, NUMERIC, TEXT, TEXT, UUID, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.void_order_item(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_sales_summary(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_order(TEXT, TEXT, JSONB, NUMERIC, TEXT, TEXT, UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_order_item(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_summary(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- ROLLBACK (manual; the old client paths still work without these):
--   DROP FUNCTION IF EXISTS public.pay_order(TEXT, TEXT, JSONB, NUMERIC, TEXT, TEXT, UUID, INT);
--   DROP FUNCTION IF EXISTS public.void_order_item(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
--   DROP FUNCTION IF EXISTS public.get_sales_summary(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT);
--   DROP INDEX IF EXISTS ux_customers_branch_phone;
--   NOTIFY pgrst, 'reload schema';
-- ============================================================
