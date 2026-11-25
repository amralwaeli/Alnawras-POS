-- 0050: an order the kitchen never got is not on the bill. When its ticket did not print
-- (the printer refused it, or no print station picked it up), the phone that sent it takes
-- those items off the bill; the waiter's Send again adds them back as a new send.
--
-- Also: a failed ticket waits 15 seconds before the station tries it again (it used to
-- retry at once, because the station's own "release" woke it up again).

CREATE OR REPLACE FUNCTION public.release_print_jobs(p_branch_id TEXT, p_item_ids TEXT[], p_cancel_ids TEXT[], p_error TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);
  -- With an error, print_claimed_at keeps the time of the failed try (see claim_print_jobs).
  UPDATE order_items SET print_error = left(p_error, 200),
                         print_claimed_at = CASE WHEN p_error IS NULL THEN NULL ELSE now() END
    WHERE branch_id = p_branch_id AND id = ANY(COALESCE(p_item_ids, '{}')) AND printed_at IS NULL;
  UPDATE order_items SET cancel_printed_at = NULL
    WHERE branch_id = p_branch_id AND id = ANY(COALESCE(p_cancel_ids, '{}'));
END; $$;

CREATE OR REPLACE FUNCTION public.claim_print_jobs(p_branch_id TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_items JSONB; v_cancels JSONB;
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);

  WITH picked AS (
    SELECT oi.id FROM order_items oi
    WHERE oi.branch_id = p_branch_id AND oi.status = 'cancelled' AND oi.cancel_printed_at IS NULL
      AND oi.printed_at IS NOT NULL AND COALESCE(oi.cancelled_at, now()) > now() - interval '12 hours'
    FOR UPDATE SKIP LOCKED
  ), done AS (
    UPDATE order_items oi SET cancel_printed_at = now() FROM picked WHERE oi.id = picked.id RETURNING oi.*
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', d.id, 'product_name', d.product_name, 'quantity', d.quantity, 'modifiers', d.modifiers,
      'station', d.station, 'by', d.cancelled_by_name, 'reason', d.cancel_reason,
      'table_number', o.table_number, 'order_type', o.order_type, 'bill_number', o.bill_number)), '[]'::jsonb)
  INTO v_cancels
  FROM done d JOIN orders o ON o.id = d.order_id;

  -- Not printed and not being printed (lease 2 minutes); a failed one again after 15 seconds.
  WITH picked AS (
    SELECT oi.id FROM order_items oi
    WHERE oi.branch_id = p_branch_id AND oi.printed_at IS NULL AND oi.created_at > now() - interval '12 hours'
      AND (oi.print_claimed_at IS NULL OR oi.print_claimed_at <
           now() - CASE WHEN oi.print_error IS NULL THEN interval '2 minutes' ELSE interval '15 seconds' END)
    FOR UPDATE SKIP LOCKED
  ), done AS (
    UPDATE order_items oi SET
      print_claimed_at  = CASE WHEN oi.status = 'cancelled' THEN NULL  ELSE now() END,
      print_error       = CASE WHEN oi.status = 'cancelled' THEN NULL  ELSE oi.print_error END,
      printed_at        = CASE WHEN oi.status = 'cancelled' THEN now() ELSE NULL END,
      cancel_printed_at = CASE WHEN oi.status = 'cancelled' THEN now() ELSE oi.cancel_printed_at END
    FROM picked WHERE oi.id = picked.id RETURNING oi.*
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', d.id, 'order_id', d.order_id, 'product_name', d.product_name, 'quantity', d.quantity,
      'notes', d.notes, 'modifiers', d.modifiers, 'station', d.station, 'added_by_name', d.added_by_name,
      'created_at', d.created_at,
      'table_number', o.table_number, 'order_type', o.order_type, 'bill_number', o.bill_number,
      'add_on', EXISTS (SELECT 1 FROM order_items x WHERE x.order_id = d.order_id AND x.created_at < d.created_at))
    ORDER BY d.created_at) FILTER (WHERE d.status IS DISTINCT FROM 'cancelled'), '[]'::jsonb)
  INTO v_items
  FROM done d JOIN orders o ON o.id = d.order_id;

  RETURN jsonb_build_object('items', v_items, 'cancels', v_cancels);
END; $$;

-- Takes items that did not print off their bill and returns the ids removed. Skips an item
-- that printed or that a station is printing right now (it will print). The bill total is
-- recalculated; a bill this send created and left empty is deleted and its table freed.
CREATE OR REPLACE FUNCTION public.withdraw_unprinted_items(
  p_branch_id TEXT, p_order_id TEXT, p_item_ids TEXT[], p_drop_empty_bill BOOLEAN DEFAULT false
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_removed TEXT[]; v_sub NUMERIC; v_bill_dropped BOOLEAN := false;
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);
  PERFORM 1 FROM orders WHERE id = p_order_id AND branch_id = p_branch_id AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('removed', '[]'::jsonb, 'bill_dropped', false); END IF;

  -- DELETE waits for a station's claim on the same row and then re-checks it.
  WITH gone AS (
    DELETE FROM order_items oi
    WHERE oi.branch_id = p_branch_id AND oi.order_id = p_order_id AND oi.id = ANY(COALESCE(p_item_ids, '{}'))
      AND oi.printed_at IS NULL AND NOT oi.paid
      AND NOT (oi.print_error IS NULL AND COALESCE(oi.print_claimed_at > now() - interval '2 minutes', false))
    RETURNING oi.id
  ) SELECT COALESCE(array_agg(id), '{}') INTO v_removed FROM gone;

  IF cardinality(v_removed) > 0 THEN
    SELECT COALESCE(SUM(subtotal), 0) INTO v_sub FROM order_items
      WHERE order_id = p_order_id AND branch_id = p_branch_id AND status IS DISTINCT FROM 'cancelled';
    UPDATE orders SET subtotal = v_sub, tax = 0, total = v_sub WHERE id = p_order_id;

    IF p_drop_empty_bill AND NOT EXISTS (SELECT 1 FROM order_items WHERE order_id = p_order_id) THEN
      BEGIN
        UPDATE tables SET status = 'available', current_order_id = NULL WHERE current_order_id = p_order_id;
        DELETE FROM orders WHERE id = p_order_id AND branch_id = p_branch_id;
        v_bill_dropped := true;
      EXCEPTION WHEN foreign_key_violation THEN
        NULL;   -- something else points at this bill: keep it (empty)
      END;
    END IF;
  END IF;

  RETURN jsonb_build_object('removed', to_jsonb(v_removed), 'bill_dropped', v_bill_dropped);
END; $$;

REVOKE ALL ON FUNCTION public.withdraw_unprinted_items(TEXT, TEXT, TEXT[], BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_unprinted_items(TEXT, TEXT, TEXT[], BOOLEAN) TO authenticated;
