-- ============================================================
-- 0021_order_payment_integrity.sql   (Batch 1 — audit fixes H4/H5/M2)
--
-- Three related correctness fixes for the order/table/payment path:
--
--   H5  next_bill_number()  — bill numbers from an atomic per-(branch,type)
--       counter instead of MAX(bill_number)+1, which raced (two checkouts could
--       read the same MAX and mint duplicate numbers). Seeded from existing data.
--   H4  move_order_to_table() — moving an open order to another table becomes one
--       locked transaction (was four unsequenced client writes with a
--       target-table race). Derives the source table from the order, so a wrong
--       from-table argument can't free the wrong table.
--   M2  pay_order_items()   — on completion the order's total is set to what was
--       ACTUALLY collected (sum of order_payments), so a split-paid bill always
--       reconciles with its payment rows instead of drifting a cent from
--       independently-rounded per-split tax. Also switched to next_bill_number.
--
-- Additive & safe. Run AFTER 0020.
-- ============================================================

-- ── H5: atomic bill-number counter ───────────────────────────
CREATE TABLE IF NOT EXISTS bill_counters (
  branch_id   TEXT NOT NULL,
  order_type  TEXT NOT NULL,
  last_number INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (branch_id, order_type)
);

-- Seed from the highest numeric bill number already issued per branch+type so
-- the counter continues the sequence instead of colliding with existing bills.
INSERT INTO bill_counters (branch_id, order_type, last_number)
  SELECT branch_id, COALESCE(order_type, 'dine-in'), MAX(bill_number::int)
  FROM orders
  WHERE bill_number IS NOT NULL AND bill_number ~ '^\d+$'
  GROUP BY branch_id, COALESCE(order_type, 'dine-in')
ON CONFLICT (branch_id, order_type)
  DO UPDATE SET last_number = GREATEST(bill_counters.last_number, EXCLUDED.last_number);

CREATE OR REPLACE FUNCTION public.next_bill_number(p_branch_id TEXT, p_order_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_num INT;
BEGIN
  -- Atomic increment: the row is locked for the duration of the upsert, so two
  -- concurrent callers can never receive the same number.
  INSERT INTO bill_counters (branch_id, order_type, last_number)
    VALUES (p_branch_id, COALESCE(p_order_type, 'dine-in'), 1)
  ON CONFLICT (branch_id, order_type)
    DO UPDATE SET last_number = bill_counters.last_number + 1
  RETURNING last_number INTO v_num;
  RETURN lpad(v_num::text, 4, '0');
END; $$;

REVOKE ALL ON FUNCTION public.next_bill_number(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_bill_number(TEXT, TEXT) TO anon, authenticated;

-- OPTIONAL hardening (run manually AFTER confirming no existing duplicates):
--   SELECT branch_id, order_type, bill_number, COUNT(*)
--     FROM orders WHERE bill_number IS NOT NULL
--     GROUP BY 1,2,3 HAVING COUNT(*) > 1;
--   -- if that returns 0 rows:
--   CREATE UNIQUE INDEX idx_orders_bill_unique
--     ON orders(branch_id, order_type, bill_number) WHERE bill_number IS NOT NULL;

-- ── H4: atomic table move ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.move_order_to_table(
  p_order_id    TEXT,
  p_to_table_id TEXT,
  p_branch_id   TEXT
) RETURNS TABLE(from_table_id TEXT, to_table_number INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order  orders%ROWTYPE;
  v_to     tables%ROWTYPE;
  v_from   TEXT;
  v_group  TEXT;
BEGIN
  -- Lock the target table first and verify it's free — serialises two staff
  -- moving different orders onto the same table at once.
  SELECT * INTO v_to FROM tables WHERE id = p_to_table_id AND branch_id = p_branch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target table not found'; END IF;
  IF v_to.status <> 'available' THEN RAISE EXCEPTION 'Target table is not available'; END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id AND branch_id = p_branch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status <> 'open' THEN RAISE EXCEPTION 'Only an open order can be moved'; END IF;

  v_from := v_order.table_id;  -- the real source, not a caller-supplied one
  IF v_from = p_to_table_id THEN RAISE EXCEPTION 'Order is already at that table'; END IF;

  UPDATE orders SET table_id = p_to_table_id, table_number = v_to.number WHERE id = p_order_id;
  UPDATE tables SET status = 'occupied', current_order_id = p_order_id WHERE id = p_to_table_id;

  IF v_from IS NOT NULL THEN
    UPDATE tables SET status = 'available', current_order_id = NULL
      WHERE id = v_from AND branch_id = p_branch_id;
    -- Move any active group-ordering session with the order.
    SELECT id INTO v_group FROM order_groups WHERE table_id = v_from AND status = 'active';
    IF v_group IS NOT NULL THEN
      UPDATE order_groups   SET table_id = p_to_table_id WHERE id = v_group;
      UPDATE guest_sessions SET table_id = p_to_table_id WHERE group_id = v_group AND status = 'active';
    END IF;
  END IF;

  from_table_id := v_from;
  to_table_number := v_to.number;
  RETURN NEXT;
END; $$;

REVOKE ALL ON FUNCTION public.move_order_to_table(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_order_to_table(TEXT, TEXT, TEXT) TO anon, authenticated;

-- ── H5 + M2: pay_order_items uses next_bill_number and reconciles totals ──
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

REVOKE ALL ON FUNCTION public.pay_order_items(TEXT, TEXT[], TEXT, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pay_order_items(TEXT, TEXT[], TEXT, NUMERIC, TEXT, TEXT, TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
