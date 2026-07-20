-- ============================================================
-- 0020_branch_settings_tax_discounts.sql
--
-- Per-branch business settings the TENANT's own admin (role='admin') controls
-- — currently: tax and quick-discount presets. These must be consistent across
-- every device at a branch (a waiter tablet and the cashier can't disagree on
-- the tax rate), so they live in the DB per branch, not in per-device
-- localStorage like the older settings.
--
--   tax_enabled / tax_rate / tax_label / tax_inclusive
--       tax_rate is a percentage (e.g. 6 = 6%). tax_inclusive=false adds tax on
--       top of the subtotal (a visible tax line); tax_inclusive=true means menu
--       prices already include tax (backed out for the receipt breakdown).
--   discount_presets  JSONB array of one-tap discounts the cashier can apply,
--       e.g. [{"id":"d1","label":"Student","type":"percentage","value":10}].
--
-- Also updates pay_order_items (from 0017) so a split-by-item bill charges the
-- same tax as a whole-order bill — otherwise splitting would dodge tax.
--
-- Additive & safe. Run AFTER 0017 and 0018.
-- ============================================================

CREATE TABLE IF NOT EXISTS branch_settings (
  branch_id        TEXT PRIMARY KEY,
  tax_enabled      BOOLEAN NOT NULL DEFAULT false,
  tax_rate         NUMERIC NOT NULL DEFAULT 0,       -- percent
  tax_label        TEXT NOT NULL DEFAULT 'Tax',
  tax_inclusive    BOOLEAN NOT NULL DEFAULT false,
  discount_presets JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── Tax-aware split payment ──────────────────────────────────
-- Re-declare pay_order_items so the per-item amount includes the branch's
-- exclusive tax (inclusive tax is already in the item price, so it isn't
-- added again). Everything else matches 0017.
CREATE OR REPLACE FUNCTION public.pay_order_items(
  p_order_id         TEXT,
  p_item_ids         TEXT[],
  p_method           TEXT,
  p_amount_received  NUMERIC,
  p_cashier_id       TEXT,
  p_cashier_name     TEXT,
  p_branch_id        TEXT
) RETURNS TABLE (payment_id TEXT, amount NUMERIC, order_completed BOOLEAN, bill_number TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order       orders%ROWTYPE;
  v_amount      NUMERIC;
  v_matched     INT;
  v_remaining   INT;
  v_payment_id  TEXT;
  v_next_num    INT;
  v_bill_number TEXT := NULL;
  v_group_id    TEXT;
  v_tax_enabled BOOLEAN := false;
  v_tax_rate    NUMERIC := 0;
  v_tax_incl    BOOLEAN := false;
  v_full_sub    NUMERIC := 0;
  v_full_tax    NUMERIC := 0;
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

  -- Add this branch's exclusive tax so a split share matches a whole-order bill.
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
      SELECT COALESCE(MAX(bill_number::int), 0) + 1 INTO v_next_num
        FROM orders WHERE branch_id = p_branch_id AND order_type = v_order.order_type AND bill_number IS NOT NULL;
      v_bill_number := lpad(v_next_num::text, 4, '0');
    ELSE
      v_bill_number := v_order.bill_number;
    END IF;

    -- Persist the final money breakdown so reports/receipts include split tax.
    SELECT COALESCE(SUM(subtotal), 0) INTO v_full_sub
      FROM order_items WHERE order_id = p_order_id AND status IS DISTINCT FROM 'cancelled';
    IF v_tax_enabled AND v_tax_rate > 0 THEN
      v_full_tax := CASE WHEN v_tax_incl
        THEN round(v_full_sub - v_full_sub / (1 + v_tax_rate / 100), 2)
        ELSE round(v_full_sub * v_tax_rate / 100, 2) END;
    END IF;

    UPDATE orders
      SET status = 'completed', completed_at = NOW(), payment_status = 'paid',
          payment_method = 'split', bill_number = v_bill_number,
          subtotal = v_full_sub, tax = v_full_tax,
          total = CASE WHEN v_tax_incl THEN v_full_sub ELSE v_full_sub + v_full_tax END
      WHERE id = p_order_id;

    IF v_order.table_id IS NOT NULL THEN
      UPDATE tables SET status = 'available', current_order_id = NULL, ordering_enabled = false
        WHERE id = v_order.table_id;
      SELECT id INTO v_group_id FROM order_groups WHERE table_id = v_order.table_id AND status = 'active';
      IF v_group_id IS NOT NULL THEN
        UPDATE guest_sessions SET status = 'closed' WHERE group_id = v_group_id;
        UPDATE order_groups SET status = 'closed', closed_at = NOW() WHERE id = v_group_id;
      END IF;
      UPDATE qr_sessions SET active = false, last_activity_at = NOW() WHERE table_id = v_order.table_id;
    END IF;
  END IF;

  RETURN QUERY SELECT v_payment_id, v_amount, (v_remaining = 0), v_bill_number;
END;
$$;

REVOKE ALL ON FUNCTION public.pay_order_items(TEXT, TEXT[], TEXT, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pay_order_items(TEXT, TEXT[], TEXT, NUMERIC, TEXT, TEXT, TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
