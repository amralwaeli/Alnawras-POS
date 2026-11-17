-- ============================================================
-- 0031_money_rpcs_branch_check.sql   (Batch 2c — audit AUD-04)
--
-- The order / payment / loyalty / report functions were callable by anyone with
-- the public key, and trusted the branch id the browser passed in. Now each one:
--   * is callable by signed-in devices only (not anon), and
--   * refuses unless the branch it is asked to act on is the branch the device
--     is signed in to (current_device_branch(), 0024).
-- Loyalty calls also refuse a customer that belongs to another branch.
-- Also FIXES split payments: the last split of a bill always failed (see below).
--
-- How: the existing function bodies are kept unchanged under an internal name
-- (_..._impl, never granted), and the public name becomes a thin wrapper with
-- the same signature, so the app needs no change. Customer pages use the 0029
-- functions instead and are unaffected.
--
-- REQUIRES: 0029. Staff devices signed in with a branch login (the website
-- already is; the installed app asks once a branch login exists).
-- Idempotent: re-running does not re-rename.
-- ============================================================

CREATE OR REPLACE FUNCTION public._assert_device_branch(p_branch_id TEXT)
RETURNS VOID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_branch_id IS NULL OR p_branch_id IS DISTINCT FROM public.current_device_branch() THEN
    RAISE EXCEPTION 'This device is not signed in to that branch.' USING ERRCODE = 'insufficient_privilege';
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public._assert_device_branch(TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._assert_customer_branch(p_customer_id UUID, p_branch_id TEXT)
RETURNS VOID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM customers WHERE id = p_customer_id AND branch_id = p_branch_id) THEN
    RAISE EXCEPTION 'Customer not found in this branch.';
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public._assert_customer_branch(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- Move each current body to an internal name, once.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('pay_order_items',       'TEXT, TEXT[], TEXT, NUMERIC, TEXT, TEXT, TEXT'),
      ('move_order_to_table',   'TEXT, TEXT, TEXT'),
      ('earn_loyalty_points',   'UUID, TEXT, INT, NUMERIC, TEXT'),
      ('redeem_loyalty_points', 'UUID, TEXT, INT, TEXT'),
      ('adjust_loyalty_points', 'UUID, INT, TEXT, TEXT'),
      ('get_product_sales',     'TEXT, TIMESTAMPTZ, TIMESTAMPTZ')
    ) AS f(name, args)
  LOOP
    IF to_regprocedure(format('public._%s_impl(%s)', r.name, r.args)) IS NULL THEN
      EXECUTE format('ALTER FUNCTION public.%I(%s) RENAME TO %I', r.name, r.args, '_' || r.name || '_impl');
    END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated', '_' || r.name || '_impl', r.args);
  END LOOP;
END $$;

-- ── Fix: the split-payment body from 0021 never completed a bill ──
-- Its RETURNS TABLE column names (amount, bill_number …) collide with table
-- columns, so the LAST split of every bill failed with "column reference
-- "amount" is ambiguous" (0017/0020 failed the same way on bill_number) —
-- found by executing it in the migration tests. Same body, plus the pragma
-- that resolves those names to the table columns.
CREATE OR REPLACE FUNCTION public._pay_order_items_impl(
  p_order_id         TEXT,
  p_item_ids         TEXT[],
  p_method           TEXT,
  p_amount_received  NUMERIC,
  p_cashier_id       TEXT,
  p_cashier_name     TEXT,
  p_branch_id        TEXT
) RETURNS TABLE (payment_id TEXT, amount NUMERIC, order_completed BOOLEAN, bill_number TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  v_order       orders%ROWTYPE;
  v_amount      NUMERIC;
  v_matched     INT;
  v_remaining   INT;
  v_payment_id  TEXT;
  v_bill_number TEXT := NULL;
  v_group_id    TEXT;
  v_tax_enabled BOOLEAN := false;
  v_tax_rate    NUMERIC := 0;
  v_tax_incl    BOOLEAN := false;
  v_full_sub    NUMERIC := 0;
  v_collected   NUMERIC := 0;
  v_pretax      NUMERIC := 0;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id AND branch_id = p_branch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status <> 'open' THEN RAISE EXCEPTION 'This bill has already been paid'; END IF;
  IF p_item_ids IS NULL OR array_length(p_item_ids, 1) IS NULL THEN RAISE EXCEPTION 'No items selected'; END IF;

  SELECT COALESCE(SUM(subtotal), 0), COUNT(*)
    INTO v_amount, v_matched
    FROM order_items
    WHERE order_id = p_order_id AND id = ANY(p_item_ids)
      AND paid = false AND status IS DISTINCT FROM 'cancelled';

  IF v_matched <> array_length(p_item_ids, 1) THEN
    RAISE EXCEPTION 'One or more selected items are no longer available to pay (already paid, voided, or not on this order)';
  END IF;
  IF v_amount <= 0 THEN RAISE EXCEPTION 'Nothing to pay'; END IF;

  SELECT tax_enabled, tax_rate, tax_inclusive INTO v_tax_enabled, v_tax_rate, v_tax_incl
    FROM branch_settings WHERE branch_id = p_branch_id;
  IF v_tax_enabled AND v_tax_rate > 0 AND NOT v_tax_incl THEN
    v_amount := round(v_amount * (1 + v_tax_rate / 100), 2);
  END IF;

  IF p_method = 'cash' AND p_amount_received IS NOT NULL AND p_amount_received < v_amount THEN
    RAISE EXCEPTION 'Amount received is less than the amount due';
  END IF;

  v_payment_id := 'opay-' || substr(md5(random()::text || clock_timestamp()::text), 1, 20);

  UPDATE order_items SET paid = true, paid_at = NOW(), payment_id = v_payment_id
    WHERE order_id = p_order_id AND id = ANY(p_item_ids);

  INSERT INTO order_payments (id, order_id, amount, method, item_ids, cashier_id, cashier_name, branch_id)
    VALUES (v_payment_id, p_order_id, v_amount, p_method, to_jsonb(p_item_ids), p_cashier_id, p_cashier_name, p_branch_id);

  SELECT COUNT(*) INTO v_remaining
    FROM order_items WHERE order_id = p_order_id AND paid = false AND status IS DISTINCT FROM 'cancelled';

  IF v_remaining = 0 THEN
    IF v_order.bill_number IS NULL THEN
      v_bill_number := public.next_bill_number(p_branch_id, v_order.order_type);
    ELSE
      v_bill_number := v_order.bill_number;
    END IF;

    -- M2: the order total is exactly what was collected across all splits, so
    -- it always reconciles with order_payments (no per-split rounding drift).
    SELECT COALESCE(SUM(amount), 0)   INTO v_collected FROM order_payments WHERE order_id = p_order_id;
    SELECT COALESCE(SUM(subtotal), 0) INTO v_full_sub  FROM order_items
      WHERE order_id = p_order_id AND status IS DISTINCT FROM 'cancelled';

    IF v_tax_enabled AND v_tax_rate > 0 AND v_tax_incl THEN
      v_pretax := round(v_collected / (1 + v_tax_rate / 100), 2);
      UPDATE orders SET status='completed', completed_at=NOW(), payment_status='paid',
        payment_method='split', bill_number=v_bill_number,
        subtotal=v_pretax, tax=(v_collected - v_pretax), total=v_collected
        WHERE id = p_order_id;
    ELSE
      UPDATE orders SET status='completed', completed_at=NOW(), payment_status='paid',
        payment_method='split', bill_number=v_bill_number,
        subtotal=v_full_sub, tax=round(v_collected - v_full_sub, 2), total=v_collected
        WHERE id = p_order_id;
    END IF;

    IF v_order.table_id IS NOT NULL THEN
      UPDATE tables SET status='available', current_order_id=NULL, ordering_enabled=false
        WHERE id = v_order.table_id;
      SELECT id INTO v_group_id FROM order_groups WHERE table_id = v_order.table_id AND status = 'active';
      IF v_group_id IS NOT NULL THEN
        UPDATE guest_sessions SET status='closed' WHERE group_id = v_group_id;
        UPDATE order_groups   SET status='closed', closed_at=NOW() WHERE id = v_group_id;
      END IF;
      UPDATE qr_sessions SET active=false, last_activity_at=NOW() WHERE table_id = v_order.table_id;
    END IF;
  END IF;

  RETURN QUERY SELECT v_payment_id, v_amount, (v_remaining = 0), v_bill_number;
END; $$;
REVOKE ALL ON FUNCTION public._pay_order_items_impl(TEXT, TEXT[], TEXT, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- ── Wrappers (same names + signatures the app already calls) ──
CREATE OR REPLACE FUNCTION public.pay_order_items(
  p_order_id TEXT, p_item_ids TEXT[], p_method TEXT, p_amount_received NUMERIC,
  p_cashier_id TEXT, p_cashier_name TEXT, p_branch_id TEXT
) RETURNS TABLE (payment_id TEXT, amount NUMERIC, order_completed BOOLEAN, bill_number TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);
  RETURN QUERY SELECT * FROM public._pay_order_items_impl(
    p_order_id, p_item_ids, p_method, p_amount_received, p_cashier_id, p_cashier_name, p_branch_id);
END; $$;

CREATE OR REPLACE FUNCTION public.move_order_to_table(p_order_id TEXT, p_to_table_id TEXT, p_branch_id TEXT)
RETURNS TABLE (from_table_id TEXT, to_table_number INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);
  RETURN QUERY SELECT * FROM public._move_order_to_table_impl(p_order_id, p_to_table_id, p_branch_id);
END; $$;

CREATE OR REPLACE FUNCTION public.earn_loyalty_points(
  p_customer_id UUID, p_order_id TEXT, p_points INT, p_amount NUMERIC, p_branch_id TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);
  PERFORM public._assert_customer_branch(p_customer_id, p_branch_id);
  PERFORM public._earn_loyalty_points_impl(p_customer_id, p_order_id, p_points, p_amount, p_branch_id);
END; $$;

CREATE OR REPLACE FUNCTION public.redeem_loyalty_points(
  p_customer_id UUID, p_order_id TEXT, p_points INT, p_branch_id TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);
  PERFORM public._assert_customer_branch(p_customer_id, p_branch_id);
  RETURN public._redeem_loyalty_points_impl(p_customer_id, p_order_id, p_points, p_branch_id);
END; $$;

CREATE OR REPLACE FUNCTION public.adjust_loyalty_points(
  p_customer_id UUID, p_points INT, p_description TEXT, p_branch_id TEXT
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);
  PERFORM public._assert_customer_branch(p_customer_id, p_branch_id);
  RETURN public._adjust_loyalty_points_impl(p_customer_id, p_points, p_description, p_branch_id);
END; $$;

CREATE OR REPLACE FUNCTION public.get_product_sales(p_branch_id TEXT, p_date_from TIMESTAMPTZ, p_date_to TIMESTAMPTZ)
RETURNS TABLE (product_id TEXT, product_name TEXT, units_sold BIGINT, revenue NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);
  RETURN QUERY SELECT * FROM public._get_product_sales_impl(p_branch_id, p_date_from, p_date_to);
END; $$;

CREATE OR REPLACE FUNCTION public.submit_order_items(
  p_order_id TEXT, p_branch_id TEXT, p_added_by TEXT, p_added_by_name TEXT, p_items JSONB
) RETURNS TABLE (
  id TEXT, product_id TEXT, product_name TEXT, quantity INT,
  price NUMERIC, subtotal NUMERIC, station TEXT, status TEXT,
  notes TEXT, modifiers JSONB, added_by_name TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);
  RETURN QUERY SELECT * FROM public._add_order_items(p_order_id, p_branch_id, p_added_by, p_added_by_name, p_items);
END; $$;

CREATE OR REPLACE FUNCTION public.next_bill_number(p_branch_id TEXT, p_order_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);
  RETURN public._next_bill_number(p_branch_id, p_order_type);
END; $$;

-- ── Grants: signed-in devices only ───────────────────────────
DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'pay_order_items(TEXT, TEXT[], TEXT, NUMERIC, TEXT, TEXT, TEXT)',
    'move_order_to_table(TEXT, TEXT, TEXT)',
    'earn_loyalty_points(UUID, TEXT, INT, NUMERIC, TEXT)',
    'redeem_loyalty_points(UUID, TEXT, INT, TEXT)',
    'adjust_loyalty_points(UUID, INT, TEXT, TEXT)',
    'get_product_sales(TEXT, TIMESTAMPTZ, TIMESTAMPTZ)',
    'submit_order_items(TEXT, TEXT, TEXT, TEXT, JSONB)',
    'next_bill_number(TEXT, TEXT)']
  LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION public.' || f || ' FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.' || f || ' TO authenticated';
  END LOOP;
END $$;

-- The old "join table group" (0008) is replaced by guest_join (0029): close it.
REVOKE ALL ON FUNCTION public.join_table_group(TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- ROLLBACK (manual): re-open the functions to everyone without the check.
--   For each wrapper above: DROP FUNCTION public.<name>(<args>);
--   ALTER FUNCTION public._<name>_impl(<args>) RENAME TO <name>;
--   GRANT EXECUTE ON FUNCTION public.<name>(<args>) TO anon, authenticated;
--   (submit_order_items / next_bill_number: re-run 0029.)
-- ============================================================
