-- 0053: tickets for more than one station.
--   products.also_stations   the item also prints at these stations (e.g. a shawarma plate:
--                            shawarma makes the meat, the kitchen the rice)
--   modifier_options.station a choice made at another station (e.g. the free juice of a
--                            family meal prints on the drinks ticket); NULL = with the item
-- claim_print_jobs now returns both for each item (and also_stations for cancel tickets).

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS also_stations TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.modifier_options ADD COLUMN IF NOT EXISTS station TEXT;

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
      'also', COALESCE((SELECT p.also_stations FROM products p WHERE p.id = d.product_id), '{}'),
      'table_number', o.table_number, 'order_type', o.order_type, 'bill_number', o.bill_number)), '[]'::jsonb)
  INTO v_cancels
  FROM done d JOIN orders o ON o.id = d.order_id;

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
      'also', COALESCE((SELECT p.also_stations FROM products p WHERE p.id = d.product_id), '{}'),
      'option_stations', (SELECT jsonb_object_agg(mo.id, mo.station) FROM modifier_options mo
                          WHERE mo.station IS NOT NULL
                            AND mo.id IN (SELECT m->>'optionId' FROM jsonb_array_elements(COALESCE(d.modifiers, '[]'::jsonb)) m)),
      'table_number', o.table_number, 'order_type', o.order_type, 'bill_number', o.bill_number,
      'add_on', EXISTS (SELECT 1 FROM order_items x WHERE x.order_id = d.order_id AND x.created_at < d.created_at))
    ORDER BY d.created_at) FILTER (WHERE d.status IS DISTINCT FROM 'cancelled'), '[]'::jsonb)
  INTO v_items
  FROM done d JOIN orders o ON o.id = d.order_id;

  RETURN jsonb_build_object('items', v_items, 'cancels', v_cancels);
END; $$;
