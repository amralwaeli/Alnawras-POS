-- 0048: print station. Waiter phones may be on any internet (mobile data, another Wi-Fi),
-- but the restaurant's printers only answer on its own network. One device there (the
-- cashier tablet, with "Print station" switched on) prints every ticket: it claims the
-- items not printed yet, prints them, and hands back any a printer refused (retried later).
--   printed_at         the kitchen/drinks ticket for this item has been printed
--   cancel_printed_at  the CANCELLED ticket for this item has been printed

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS printed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_printed_at TIMESTAMPTZ;

-- Items already in the database count as printed: switching a station on must not
-- reprint old orders. (Only the two new columns change; no trigger watches them.)
UPDATE public.order_items SET printed_at = COALESCE(created_at, now()) WHERE printed_at IS NULL;
UPDATE public.order_items SET cancel_printed_at = now() WHERE status = 'cancelled' AND cancel_printed_at IS NULL;

CREATE INDEX IF NOT EXISTS order_items_to_print ON public.order_items (branch_id)
  WHERE printed_at IS NULL OR (status = 'cancelled' AND cancel_printed_at IS NULL);

-- Claims everything waiting to print for the device's branch (at most 12 hours old), in one
-- call: { items: [...new items + bill details + add_on], cancels: [...cancelled items] }.
-- SKIP LOCKED: two stations never get the same item.
CREATE OR REPLACE FUNCTION public.claim_print_jobs(p_branch_id TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_items JSONB; v_cancels JSONB;
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);

  -- Cancellations first, so an item cancelled before its ticket printed is handled below.
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

  -- New items. One that was cancelled before it ever printed is marked done, not printed.
  WITH picked AS (
    SELECT oi.id FROM order_items oi
    WHERE oi.branch_id = p_branch_id AND oi.printed_at IS NULL AND oi.created_at > now() - interval '12 hours'
    FOR UPDATE SKIP LOCKED
  ), done AS (
    UPDATE order_items oi SET printed_at = now(),
      cancel_printed_at = CASE WHEN oi.status = 'cancelled' THEN now() ELSE oi.cancel_printed_at END
    FROM picked WHERE oi.id = picked.id RETURNING oi.*
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', d.id, 'order_id', d.order_id, 'product_name', d.product_name, 'quantity', d.quantity,
      'notes', d.notes, 'modifiers', d.modifiers, 'station', d.station, 'added_by_name', d.added_by_name,
      'created_at', d.created_at,
      'table_number', o.table_number, 'order_type', o.order_type, 'bill_number', o.bill_number,
      -- Items sent in one go share created_at (one transaction); anything older on the bill = ADD ON.
      'add_on', EXISTS (SELECT 1 FROM order_items x WHERE x.order_id = d.order_id AND x.created_at < d.created_at))
    ORDER BY d.created_at) FILTER (WHERE d.status IS DISTINCT FROM 'cancelled'), '[]'::jsonb)
  INTO v_items
  FROM done d JOIN orders o ON o.id = d.order_id;

  RETURN jsonb_build_object('items', v_items, 'cancels', v_cancels);
END; $$;

-- A printer was off or unreachable: give these back so the next claim retries them.
CREATE OR REPLACE FUNCTION public.release_print_jobs(p_branch_id TEXT, p_item_ids TEXT[], p_cancel_ids TEXT[])
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);
  UPDATE order_items SET printed_at = NULL
    WHERE branch_id = p_branch_id AND id = ANY(COALESCE(p_item_ids, '{}'));
  UPDATE order_items SET cancel_printed_at = NULL
    WHERE branch_id = p_branch_id AND id = ANY(COALESCE(p_cancel_ids, '{}'));
END; $$;

-- Lines a device printed itself while offline come back through the queue with
-- "printed": true, so the station does not print them a second time.
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
  UPDATE order_items oi SET printed_at = now()
  WHERE oi.order_id = p_order_id AND oi.printed_at IS NULL
    AND oi.id IN (SELECT e->>'client_id' FROM jsonb_array_elements(p_items) e
                  WHERE jsonb_typeof(e->'printed') = 'boolean' AND (e->>'printed')::boolean);
END; $$;

REVOKE ALL ON FUNCTION public.claim_print_jobs(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_print_jobs(TEXT, TEXT[], TEXT[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_order_items(TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_print_jobs(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_print_jobs(TEXT, TEXT[], TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_order_items(TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;
