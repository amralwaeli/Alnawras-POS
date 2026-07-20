-- ============================================================
-- 0017_split_payments.sql
--
-- Lets a table's bill be paid off by item instead of only as one whole-order
-- payment ("everyone pays for what they ate"). A single order can now be
-- settled across several calls to pay_order_items, each covering a subset of
-- its items; the order only flips to completed once every (non-cancelled)
-- item has been paid.
--
-- pay_order_items() is written server-side-first rather than client-trusted:
-- it re-reads the named items' prices from the DB itself (never trusts a
-- client-computed subtotal) and is the audit trail of record for every
-- partial settlement via order_payments.
-- ============================================================

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS paid       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_id TEXT;

CREATE TABLE IF NOT EXISTS order_payments (
  id           TEXT PRIMARY KEY,
  order_id     TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount       DECIMAL(10,2) NOT NULL,
  method       TEXT NOT NULL,
  item_ids     JSONB NOT NULL DEFAULT '[]'::jsonb,
  cashier_id   TEXT,
  cashier_name TEXT,
  branch_id    TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments(order_id);

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
BEGIN
  -- Row-lock the order so two cashiers can't settle overlapping items, or
  -- both trigger the "last split closes the order" branch, at the same time.
  SELECT * INTO v_order FROM orders WHERE id = p_order_id AND branch_id = p_branch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_order.status <> 'open' THEN
    RAISE EXCEPTION 'This bill has already been paid';
  END IF;
  IF p_item_ids IS NULL OR array_length(p_item_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No items selected';
  END IF;

  -- Sum the DB's own price for exactly the requested items — never trust a
  -- client-computed total. Only matches items that are still unpaid and not
  -- voided; a mismatch below means the selection is stale.
  SELECT COALESCE(SUM(subtotal), 0), COUNT(*)
    INTO v_amount, v_matched
    FROM order_items
    WHERE order_id = p_order_id AND id = ANY(p_item_ids)
      AND paid = false AND status IS DISTINCT FROM 'cancelled';

  IF v_matched <> array_length(p_item_ids, 1) THEN
    RAISE EXCEPTION 'One or more selected items are no longer available to pay (already paid, voided, or not on this order)';
  END IF;
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Nothing to pay';
  END IF;
  IF p_method = 'cash' AND p_amount_received IS NOT NULL AND p_amount_received < v_amount THEN
    RAISE EXCEPTION 'Amount received is less than the amount due';
  END IF;

  v_payment_id := 'opay-' || substr(md5(random()::text || clock_timestamp()::text), 1, 20);

  UPDATE order_items
    SET paid = true, paid_at = NOW(), payment_id = v_payment_id
    WHERE order_id = p_order_id AND id = ANY(p_item_ids);

  INSERT INTO order_payments (id, order_id, amount, method, item_ids, cashier_id, cashier_name, branch_id)
    VALUES (v_payment_id, p_order_id, v_amount, p_method, to_jsonb(p_item_ids), p_cashier_id, p_cashier_name, p_branch_id);

  SELECT COUNT(*) INTO v_remaining
    FROM order_items
    WHERE order_id = p_order_id AND paid = false AND status IS DISTINCT FROM 'cancelled';

  IF v_remaining = 0 THEN
    -- Last split settles the bill. Dine-in orders don't get a bill number
    -- until payment (same as the existing whole-order path) — assign one now
    -- if this order doesn't already have one.
    IF v_order.bill_number IS NULL THEN
      SELECT COALESCE(MAX(bill_number::int), 0) + 1 INTO v_next_num
        FROM orders WHERE branch_id = p_branch_id AND order_type = v_order.order_type AND bill_number IS NOT NULL;
      v_bill_number := lpad(v_next_num::text, 4, '0');
    ELSE
      v_bill_number := v_order.bill_number;
    END IF;

    UPDATE orders
      SET status = 'completed', completed_at = NOW(), payment_status = 'paid',
          payment_method = 'split', bill_number = v_bill_number
      WHERE id = p_order_id;

    -- Free the table and close out QR/group ordering exactly like a normal
    -- whole-order payment does (see PaymentModal.handlePayment / TablesView).
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
