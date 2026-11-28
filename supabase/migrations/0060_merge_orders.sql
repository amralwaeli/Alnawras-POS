-- ============================================================
-- 0060_merge_orders.sql
--
-- Merge two OPEN bills of a branch into one (table+table, table+takeaway,
-- takeaway+takeaway, pickup). Every item of the "from" bill moves to the
-- "into" bill with its status and print state, so nothing prints again; the
-- "from" bill is deleted and its table freed.
--
-- Rows that point at orders(id), and what happens to the from bill's:
--   order_items          moved (incl. cancelled, so the void history stays)
--   order_payments       refused before anything moves (CASCADE would lose money)
--   refunds              only on completed bills, which are refused
--   loyalty_transactions repointed (FK without ON DELETE would block the delete)
--   debt_entries         repointed (no FK, kept for history)
--   pickup_tokens        ON DELETE SET NULL: the customer link is detached, never
--                        pointed at the merged bill (it may be another table's)
--   order_groups         closed with the from table's guest/QR sessions, as pay does
--
-- The merged bill is named "Merged: " + every bill in it, the into bill first,
-- then the others in merge order (orders.merged_label).
--
-- REQUIRES: 0031, 0049. Idempotent.
-- ============================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS merged_label TEXT;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_merged_label_len;
ALTER TABLE public.orders ADD CONSTRAINT orders_merged_label_len CHECK (char_length(merged_label) <= 500);

CREATE OR REPLACE FUNCTION public.merge_orders(
  p_branch_id TEXT, p_from_order_id TEXT, p_into_order_id TEXT, p_actor_name TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  v_from   orders%ROWTYPE;
  v_into   orders%ROWTYPE;
  v_moved  INT;
  v_sub    NUMERIC;
  v_group  TEXT;
  v_label  TEXT;
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);
  IF p_from_order_id IS NOT DISTINCT FROM p_into_order_id THEN
    RAISE EXCEPTION 'Choose a different bill';
  END IF;

  -- Lock both bills in id order so two opposite merges cannot deadlock.
  PERFORM 1 FROM orders WHERE id IN (p_from_order_id, p_into_order_id) AND branch_id = p_branch_id
    ORDER BY id FOR UPDATE;
  SELECT * INTO v_from FROM orders WHERE id = p_from_order_id AND branch_id = p_branch_id;
  SELECT * INTO v_into FROM orders WHERE id = p_into_order_id AND branch_id = p_branch_id;
  IF v_from.id IS NULL OR v_into.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_from.status <> 'open' OR v_into.status <> 'open' THEN RAISE EXCEPTION 'Both bills must be open'; END IF;

  IF EXISTS (SELECT 1 FROM order_payments WHERE order_id IN (p_from_order_id, p_into_order_id))
     OR EXISTS (SELECT 1 FROM order_items WHERE order_id IN (p_from_order_id, p_into_order_id) AND paid) THEN
    RAISE EXCEPTION 'A bill that is partly paid cannot be merged — finish the split first';
  END IF;
  IF 'pending_verification' IN (v_from.payment_status, v_into.payment_status) THEN
    RAISE EXCEPTION 'A bill waiting for an online payment check cannot be merged';
  END IF;

  UPDATE order_items SET order_id = p_into_order_id WHERE order_id = p_from_order_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  UPDATE loyalty_transactions SET order_id = p_into_order_id WHERE order_id = p_from_order_id;
  UPDATE debt_entries         SET order_id = p_into_order_id WHERE order_id = p_from_order_id;

  -- Totals as every other item change (void_order_item): open bill, tax 0, discount kept.
  SELECT COALESCE(SUM(subtotal), 0) INTO v_sub FROM order_items
    WHERE order_id = p_into_order_id AND status IS DISTINCT FROM 'cancelled';
  UPDATE orders SET subtotal = v_sub, tax = 0, total = v_sub,
    waiters = COALESCE((
      SELECT jsonb_agg(DISTINCT w) FROM (
        SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(v_into.waiters) = 'array' THEN v_into.waiters ELSE '[]' END) w
        UNION ALL
        SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(v_from.waiters) = 'array' THEN v_from.waiters ELSE '[]' END)) x),
      '[]'::jsonb)
    WHERE id = p_into_order_id;

  -- Free the from table, unless both bills sit on the same table.
  IF v_from.table_id IS NOT NULL AND v_from.table_id IS DISTINCT FROM v_into.table_id THEN
    UPDATE tables SET status = 'available', current_order_id = NULL, ordering_enabled = false, needs_waiter = false
      WHERE id = v_from.table_id;
    SELECT id INTO v_group FROM order_groups WHERE table_id = v_from.table_id AND status = 'active';
    IF v_group IS NOT NULL THEN
      UPDATE guest_sessions SET status = 'closed' WHERE group_id = v_group;
      UPDATE order_groups   SET status = 'closed', closed_at = NOW() WHERE id = v_group;
    END IF;
    UPDATE qr_sessions SET active = false, last_activity_at = NOW() WHERE table_id = v_from.table_id;
  END IF;
  IF v_into.table_id IS NOT NULL AND v_into.order_type = 'dine-in' THEN
    UPDATE tables SET status = 'occupied', current_order_id = p_into_order_id WHERE id = v_into.table_id;
  END IF;

  -- Each part: the bill's merged names without 'Merged: ', else its own name.
  v_label := left('Merged: ' ||
    COALESCE(regexp_replace(v_into.merged_label, '^Merged: ', ''),
      CASE v_into.order_type WHEN 'dine-in' THEN 'Table ' || v_into.table_number
        WHEN 'takeaway' THEN 'Takeaway' || COALESCE(' #' || NULLIF(v_into.bill_number, ''), '')
        WHEN 'pickup' THEN 'Pickup' || COALESCE(' #' || NULLIF(v_into.bill_number, ''), '') END, 'Bill')
    || ' + ' ||
    COALESCE(regexp_replace(v_from.merged_label, '^Merged: ', ''),
      CASE v_from.order_type WHEN 'dine-in' THEN 'Table ' || v_from.table_number
        WHEN 'takeaway' THEN 'Takeaway' || COALESCE(' #' || NULLIF(v_from.bill_number, ''), '')
        WHEN 'pickup' THEN 'Pickup' || COALESCE(' #' || NULLIF(v_from.bill_number, ''), '') END, 'Bill'), 500);
  UPDATE orders SET merged_label = v_label WHERE id = p_into_order_id;

  DELETE FROM orders WHERE id = p_from_order_id;

  INSERT INTO audit_logs(id, action, entity, entity_id, user_id, user_name, branch_id, details)
    VALUES ('aud-' || substr(public._random_token(), 1, 20), 'order.merged', 'order', p_into_order_id,
            NULL, left(p_actor_name, 100), p_branch_id,
            jsonb_build_object('from', p_from_order_id, 'from_table', v_from.table_number,
                               'from_type', v_from.order_type, 'from_total', v_from.total, 'moved_items', v_moved));

  RETURN jsonb_build_object('into_order_id', p_into_order_id, 'moved_items', v_moved, 'merged_label', v_label);
END; $$;

REVOKE ALL ON FUNCTION public.merge_orders(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_orders(TEXT, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ROLLBACK (manual): DROP FUNCTION IF EXISTS public.merge_orders(TEXT, TEXT, TEXT, TEXT);
--                    ALTER TABLE public.orders DROP COLUMN IF EXISTS merged_label;
