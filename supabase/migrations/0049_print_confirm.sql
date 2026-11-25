-- 0049: printed_at now means the ticket really printed. The print station leases what it
-- is printing, confirms what printed, and records why a ticket did not print, so the waiter
-- who sent it sees "NOT PRINTED" with a Send again button (that clears the error = retry now).
--   print_claimed_at  a station is printing it now (a lease: free again after 2 minutes)
--   print_error       why the last try failed (shown to the waiter); cleared once printed

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS print_claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS print_error TEXT;

CREATE OR REPLACE FUNCTION public.claim_print_jobs(p_branch_id TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_items JSONB; v_cancels JSONB;
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);

  -- Cancel tickets, only for items whose ticket really printed (claimed = done; a refused one is given back).
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

  -- New items not printed and not being printed. One cancelled before it printed is just closed.
  WITH picked AS (
    SELECT oi.id FROM order_items oi
    WHERE oi.branch_id = p_branch_id AND oi.printed_at IS NULL AND oi.created_at > now() - interval '12 hours'
      AND (oi.print_claimed_at IS NULL OR oi.print_claimed_at < now() - interval '2 minutes')
    FOR UPDATE SKIP LOCKED
  ), done AS (
    UPDATE order_items oi SET
      print_claimed_at  = CASE WHEN oi.status = 'cancelled' THEN NULL  ELSE now() END,
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

-- The station printed these.
CREATE OR REPLACE FUNCTION public.confirm_print_jobs(p_branch_id TEXT, p_item_ids TEXT[])
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);
  UPDATE order_items SET printed_at = now(), print_claimed_at = NULL, print_error = NULL
    WHERE branch_id = p_branch_id AND id = ANY(COALESCE(p_item_ids, '{}')) AND printed_at IS NULL;
END; $$;

-- Not printed: free the items for the next try, with the reason (the station), or with no
-- reason to retry right away (the waiter's Send again).
DROP FUNCTION IF EXISTS public.release_print_jobs(TEXT, TEXT[], TEXT[]);
CREATE FUNCTION public.release_print_jobs(p_branch_id TEXT, p_item_ids TEXT[], p_cancel_ids TEXT[], p_error TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);
  UPDATE order_items SET print_claimed_at = NULL, print_error = left(p_error, 200)
    WHERE branch_id = p_branch_id AND id = ANY(COALESCE(p_item_ids, '{}')) AND printed_at IS NULL;
  UPDATE order_items SET cancel_printed_at = NULL
    WHERE branch_id = p_branch_id AND id = ANY(COALESCE(p_cancel_ids, '{}'));
END; $$;

REVOKE ALL ON FUNCTION public.claim_print_jobs(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_print_jobs(TEXT, TEXT[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_print_jobs(TEXT, TEXT[], TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_print_jobs(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_print_jobs(TEXT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_print_jobs(TEXT, TEXT[], TEXT[], TEXT) TO authenticated;
