-- 0047: the detailed reports, computed in the database in one call (low egress):
--   by_hour        bills paid per local hour (peak times)
--   by_category    item sales per menu category
--   by_waiter      items each staff member added (sold) and their value
--   by_cashier     money each cashier took (payments)
--   by_table       dine-in bills and revenue per table
--   discounts      bills with a discount, total given, the list
--   cancellations  items cancelled after being sent: totals, by item, by staff, the list
--                  (who, why, when); plus whole bills cancelled
-- Covers bills still in the database; months archived by 0039 only appear in
-- get_sales_summary's totals.

CREATE OR REPLACE FUNCTION public.get_detail_report(
  p_branch_id TEXT, p_from TIMESTAMPTZ, p_to TIMESTAMPTZ, p_tz TEXT DEFAULT 'Asia/Kuala_Lumpur'
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tz TEXT := COALESCE(NULLIF(p_tz, ''), 'Asia/Kuala_Lumpur');
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);
  IF p_to <= p_from THEN RAISE EXCEPTION 'Invalid date range'; END IF;
  IF p_to - p_from > interval '400 days' THEN RAISE EXCEPTION 'Please choose a range of about a year or less'; END IF;
  PERFORM now() AT TIME ZONE v_tz;      -- rejects an unknown timezone name early

  RETURN (
    WITH done AS (
      SELECT o.* FROM orders o
      WHERE o.branch_id = p_branch_id AND o.status = 'completed'
        AND o.completed_at >= p_from AND o.completed_at < p_to
    ),
    sold AS (
      SELECT oi.*, COALESCE(NULLIF(p.category, ''), 'Other') AS category
      FROM order_items oi JOIN done d ON d.id = oi.order_id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.status IS DISTINCT FROM 'cancelled'
    ),
    voided AS (
      SELECT oi.*, o.table_number, o.order_type, o.bill_number
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE oi.branch_id = p_branch_id AND oi.status = 'cancelled'
        AND oi.cancelled_at >= p_from AND oi.cancelled_at < p_to
    ),
    dropped AS (
      SELECT o.* FROM orders o
      WHERE o.branch_id = p_branch_id AND o.status = 'cancelled'
        AND o.created_at >= p_from AND o.created_at < p_to
    )
    SELECT jsonb_build_object(
      'by_hour', COALESCE((SELECT jsonb_agg(jsonb_build_object('hour', h, 'revenue', rev, 'orders', n) ORDER BY h) FROM (
          SELECT extract(hour FROM completed_at AT TIME ZONE v_tz)::int h, SUM(total) rev, COUNT(*) n FROM done GROUP BY 1) x), '[]'::jsonb),
      'by_category', COALESCE((SELECT jsonb_agg(jsonb_build_object('category', category, 'units', u, 'revenue', rev) ORDER BY rev DESC) FROM (
          SELECT category, SUM(quantity) u, SUM(subtotal) rev FROM sold GROUP BY 1) x), '[]'::jsonb),
      'by_waiter', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', name, 'items', u, 'revenue', rev, 'bills', b) ORDER BY rev DESC) FROM (
          SELECT COALESCE(NULLIF(added_by_name, ''), 'Guest / QR') name, SUM(quantity) u, SUM(subtotal) rev, COUNT(DISTINCT order_id) b
          FROM sold GROUP BY 1) x), '[]'::jsonb),
      'by_cashier', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', name, 'payments', n, 'amount', amt) ORDER BY amt DESC) FROM (
          SELECT COALESCE(NULLIF(op.cashier_name, ''), 'Unknown') name, COUNT(*) n, SUM(op.amount) amt
          FROM order_payments op
          WHERE op.branch_id = p_branch_id AND op.created_at >= p_from AND op.created_at < p_to GROUP BY 1) x), '[]'::jsonb),
      'by_table', COALESCE((SELECT jsonb_agg(jsonb_build_object('table', t, 'bills', n, 'revenue', rev) ORDER BY rev DESC) FROM (
          SELECT table_number t, COUNT(*) n, SUM(total) rev FROM done
          WHERE COALESCE(order_type, 'dine-in') = 'dine-in' GROUP BY 1) x), '[]'::jsonb),
      'discounts', jsonb_build_object(
          'bills', (SELECT COUNT(*) FROM done WHERE discount > 0),
          'total', COALESCE((SELECT SUM(discount) FROM done WHERE discount > 0), 0),
          'list', COALESCE((SELECT jsonb_agg(x ORDER BY x->>'at' DESC) FROM (
              SELECT jsonb_build_object('at', completed_at, 'bill', bill_number, 'table', table_number, 'type', order_type,
                                        'discount', discount, 'total', total, 'cashier', cashier_name) x
              FROM done WHERE discount > 0 ORDER BY completed_at DESC LIMIT 300) y), '[]'::jsonb)),
      'cancellations', jsonb_build_object(
          'items', (SELECT COUNT(*) FROM voided),
          'units', COALESCE((SELECT SUM(quantity) FROM voided), 0),
          'value', COALESCE((SELECT SUM(subtotal) FROM voided), 0),
          'by_item', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', product_name, 'units', u, 'value', v) ORDER BY u DESC) FROM (
              SELECT product_name, SUM(quantity) u, SUM(subtotal) v FROM voided GROUP BY 1) x), '[]'::jsonb),
          'by_staff', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', name, 'items', n, 'value', v) ORDER BY n DESC) FROM (
              SELECT COALESCE(NULLIF(cancelled_by_name, ''), 'Unknown') name, COUNT(*) n, SUM(subtotal) v FROM voided GROUP BY 1) x), '[]'::jsonb),
          'list', COALESCE((SELECT jsonb_agg(x ORDER BY x->>'at' DESC) FROM (
              SELECT jsonb_build_object('at', cancelled_at, 'product', product_name, 'units', quantity, 'value', subtotal,
                                        'table', table_number, 'type', order_type, 'bill', bill_number,
                                        'by', cancelled_by_name, 'reason', cancel_reason, 'ordered_by', added_by_name) x
              FROM voided ORDER BY cancelled_at DESC LIMIT 300) y), '[]'::jsonb),
          'bills', (SELECT COUNT(*) FROM dropped),
          'bills_value', COALESCE((SELECT SUM(total) FROM dropped), 0),
          'bill_list', COALESCE((SELECT jsonb_agg(x ORDER BY x->>'at' DESC) FROM (
              SELECT jsonb_build_object('at', created_at, 'table', table_number, 'type', order_type, 'bill', bill_number, 'total', total) x
              FROM dropped ORDER BY created_at DESC LIMIT 100) y), '[]'::jsonb))
    )
  );
END; $$;
REVOKE ALL ON FUNCTION public.get_detail_report(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_detail_report(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;
