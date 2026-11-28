-- ============================================================
-- 0058_split_discount.sql
--
-- A split bill can carry ONE percentage discount for every guest. The cashier
-- sets it with the first guest's payment; every later guest of that bill pays
-- with the same percentage (a different one is refused).
--
--   * orders.split_discount_pct (0..100) holds the bill's percentage.
--   * _pay_order_items_impl gains p_discount_pct (NULL = use the bill's).
--   * pay_order_items keeps its 7-arg form (old app versions, no discount) and
--     gains an 8-arg form with p_discount_pct.
--   * On completion orders.discount records the discount so
--     subtotal - discount + tax = total = SUM(order_payments.amount).
--
-- REQUIRES: 0031. Idempotent.
-- ============================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS split_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_split_discount_pct_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_split_discount_pct_check
  CHECK (split_discount_pct >= 0 AND split_discount_pct <= 100);

CREATE OR REPLACE FUNCTION public._pay_order_items_impl(
  p_order_id         TEXT,
  p_item_ids         TEXT[],
  p_method           TEXT,
  p_amount_received  NUMERIC,
  p_cashier_id       TEXT,
  p_cashier_name     TEXT,
  p_branch_id        TEXT,
  p_discount_pct     NUMERIC
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
  v_pct         NUMERIC;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id AND branch_id = p_branch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status <> 'open' THEN RAISE EXCEPTION 'This bill has already been paid'; END IF;
  IF p_item_ids IS NULL OR array_length(p_item_ids, 1) IS NULL THEN RAISE EXCEPTION 'No items selected'; END IF;

  -- One discount per bill: set with the first payment, then fixed.
  v_pct := v_order.split_discount_pct;
  IF p_discount_pct IS NOT NULL THEN
    IF p_discount_pct < 0 OR p_discount_pct > 100 THEN
      RAISE EXCEPTION 'Discount must be between 0 and 100%%';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM order_payments WHERE order_id = p_order_id) THEN
      v_pct := round(p_discount_pct, 2);
      UPDATE orders SET split_discount_pct = v_pct WHERE id = p_order_id;
    ELSIF round(p_discount_pct, 2) <> v_pct THEN
      RAISE EXCEPTION 'The discount for this bill is already set to %', trim_scale(v_pct) || '%';
    END IF;
  END IF;

  SELECT COALESCE(SUM(subtotal), 0), COUNT(*)
    INTO v_amount, v_matched
    FROM order_items
    WHERE order_id = p_order_id AND id = ANY(p_item_ids)
      AND paid = false AND status IS DISTINCT FROM 'cancelled';

  IF v_matched <> array_length(p_item_ids, 1) THEN
    RAISE EXCEPTION 'One or more selected items are no longer available to pay (already paid, voided, or not on this order)';
  END IF;
  IF v_amount <= 0 THEN RAISE EXCEPTION 'Nothing to pay'; END IF;

  v_amount := round(v_amount * (1 - v_pct / 100), 2);

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
        subtotal=v_pretax, tax=(v_collected - v_pretax), total=v_collected,
        discount=GREATEST(0, v_full_sub - v_collected)
        WHERE id = p_order_id;
    ELSIF v_pct = 0 THEN
      -- no discount: exactly as before 0058 (no 1-cent "discount" from tax rounding)
      UPDATE orders SET status='completed', completed_at=NOW(), payment_status='paid',
        payment_method='split', bill_number=v_bill_number,
        subtotal=v_full_sub, tax=round(v_collected - v_full_sub, 2), total=v_collected
        WHERE id = p_order_id;
    ELSE
      IF v_tax_enabled AND v_tax_rate > 0 THEN
        v_pretax := round(v_collected / (1 + v_tax_rate / 100), 2);
      ELSE
        v_pretax := v_collected;
      END IF;
      UPDATE orders SET status='completed', completed_at=NOW(), payment_status='paid',
        payment_method='split', bill_number=v_bill_number,
        subtotal=v_full_sub, tax=(v_collected - v_pretax), total=v_collected,
        discount=GREATEST(0, v_full_sub - v_pretax)
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
REVOKE ALL ON FUNCTION public._pay_order_items_impl(TEXT, TEXT[], TEXT, NUMERIC, TEXT, TEXT, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;

-- ── Wrappers ─────────────────────────────────────────────────
-- 7-arg: old app versions; uses the bill's stored discount (0 unless set).
CREATE OR REPLACE FUNCTION public.pay_order_items(
  p_order_id TEXT, p_item_ids TEXT[], p_method TEXT, p_amount_received NUMERIC,
  p_cashier_id TEXT, p_cashier_name TEXT, p_branch_id TEXT
) RETURNS TABLE (payment_id TEXT, amount NUMERIC, order_completed BOOLEAN, bill_number TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);
  RETURN QUERY SELECT * FROM public._pay_order_items_impl(
    p_order_id, p_item_ids, p_method, p_amount_received, p_cashier_id, p_cashier_name, p_branch_id, NULL);
END; $$;

CREATE OR REPLACE FUNCTION public.pay_order_items(
  p_order_id TEXT, p_item_ids TEXT[], p_method TEXT, p_amount_received NUMERIC,
  p_cashier_id TEXT, p_cashier_name TEXT, p_branch_id TEXT, p_discount_pct NUMERIC
) RETURNS TABLE (payment_id TEXT, amount NUMERIC, order_completed BOOLEAN, bill_number TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);
  RETURN QUERY SELECT * FROM public._pay_order_items_impl(
    p_order_id, p_item_ids, p_method, p_amount_received, p_cashier_id, p_cashier_name, p_branch_id, p_discount_pct);
END; $$;

-- The 7-arg wrapper no longer calls it.
DROP FUNCTION IF EXISTS public._pay_order_items_impl(TEXT, TEXT[], TEXT, NUMERIC, TEXT, TEXT, TEXT);

REVOKE ALL ON FUNCTION public.pay_order_items(TEXT, TEXT[], TEXT, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pay_order_items(TEXT, TEXT[], TEXT, NUMERIC, TEXT, TEXT, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_order_items(TEXT, TEXT[], TEXT, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_order_items(TEXT, TEXT[], TEXT, NUMERIC, TEXT, TEXT, TEXT, NUMERIC) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- ROLLBACK (manual): re-run the _pay_order_items_impl + 7-arg wrapper section
-- of 0031; DROP FUNCTION public.pay_order_items(TEXT, TEXT[], TEXT, NUMERIC, TEXT, TEXT, TEXT, NUMERIC);
-- DROP FUNCTION public._pay_order_items_impl(TEXT, TEXT[], TEXT, NUMERIC, TEXT, TEXT, TEXT, NUMERIC);
-- ALTER TABLE public.orders DROP COLUMN split_discount_pct;
-- ============================================================
