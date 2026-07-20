-- ============================================================
-- 0016_product_sales_report.sql
--
-- Per-product sales aggregation for the Reports screen ("how many times did
-- I sell this specific product, and how much revenue did it bring in").
-- Aggregated server-side rather than pulled row-by-row into the browser —
-- cheap to add now, avoids redoing this once order history grows.
--
-- Cancelled items (see 0015) are excluded: a voided item was never actually
-- sold, so it shouldn't count toward units or revenue.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_product_sales(
  p_branch_id TEXT,
  p_date_from TIMESTAMPTZ,
  p_date_to   TIMESTAMPTZ
) RETURNS TABLE (
  product_id   TEXT,
  product_name TEXT,
  units_sold   BIGINT,
  revenue      NUMERIC
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    oi.product_id,
    oi.product_name,
    SUM(oi.quantity)::BIGINT AS units_sold,
    SUM(oi.subtotal)::NUMERIC AS revenue
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.branch_id = p_branch_id
    AND o.status = 'completed'
    AND o.created_at >= p_date_from
    AND o.created_at <  p_date_to
    AND oi.status IS DISTINCT FROM 'cancelled'
  GROUP BY oi.product_id, oi.product_name
  ORDER BY units_sold DESC;
$$;

REVOKE ALL ON FUNCTION public.get_product_sales(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_product_sales(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
