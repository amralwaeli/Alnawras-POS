-- 0059: refunds of paid bills (whole bill or chosen items).
--   refunds            one row per refund; written only by refund_order (no device write policies)
--   order_items.refund_id  NULL = not refunded
--   refund_order       checks branch + paid bill, prices the refund, marks the items;
--                      method 'account' credits the customer account the bill was charged to
--   get_sales_summary  + 'refunds', 'refunds_by_method' (by refund day; 'revenue' stays gross)
--   get_detail_report  + 'refunds' {count, total, list}
-- Role check (admin/manager/cashier) and the shift's cash drawer are handled in the app.

CREATE TABLE IF NOT EXISTS public.refunds (
  id               TEXT PRIMARY KEY,
  branch_id        TEXT NOT NULL,
  order_id         TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  item_ids         TEXT[] NOT NULL DEFAULT '{}',
  amount           NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  method           TEXT NOT NULL CHECK (method IN ('cash','card','qr','account')),
  reason           TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 300),
  refunded_by_id   TEXT,
  refunded_by_name TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refunds_branch_created_idx ON public.refunds(branch_id, created_at);
CREATE INDEX IF NOT EXISTS refunds_order_idx ON public.refunds(order_id);

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS branch_read ON public.refunds;
CREATE POLICY branch_read ON public.refunds FOR SELECT TO authenticated
  USING (branch_id = (SELECT public.current_device_branch()));
REVOKE ALL ON public.refunds FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.refunds FROM authenticated;   -- writes only through refund_order

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS refund_id TEXT;

CREATE OR REPLACE FUNCTION public.refund_order(
  p_branch_id TEXT, p_order_id TEXT, p_item_ids TEXT[], p_method TEXT, p_reason TEXT,
  p_actor_id TEXT, p_actor_name TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order  orders%ROWTYPE;
  v_reason TEXT := btrim(COALESCE(p_reason, ''));
  v_ids    TEXT[];
  v_sel    NUMERIC;
  v_all    NUMERIC;
  v_prev   NUMERIC;
  v_amount NUMERIC;
  v_id     TEXT;
  v_acct   TEXT;
  v_charged NUMERIC;
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.status IS DISTINCT FROM 'completed' OR v_order.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'Only a paid bill can be refunded';
  END IF;
  IF p_method IS NULL OR p_method NOT IN ('cash', 'card', 'qr', 'account') THEN
    RAISE EXCEPTION 'Invalid refund method';
  END IF;
  IF length(v_reason) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'A reason (up to 300 characters) is required';
  END IF;

  IF p_item_ids IS NULL OR cardinality(p_item_ids) = 0 THEN
    SELECT COALESCE(array_agg(oi.id), '{}') INTO v_ids FROM order_items oi
     WHERE oi.order_id = p_order_id AND oi.status IS DISTINCT FROM 'cancelled' AND oi.refund_id IS NULL;
  ELSE
    SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(p_item_ids) x;
    IF EXISTS (SELECT 1 FROM unnest(v_ids) x WHERE NOT EXISTS (
         SELECT 1 FROM order_items oi WHERE oi.id = x AND oi.order_id = p_order_id AND oi.status IS DISTINCT FROM 'cancelled')) THEN
      RAISE EXCEPTION 'This item is not on this bill';
    END IF;
    IF EXISTS (SELECT 1 FROM order_items oi WHERE oi.id = ANY(v_ids) AND oi.refund_id IS NOT NULL) THEN
      RAISE EXCEPTION 'This item was already refunded';
    END IF;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_prev FROM refunds WHERE order_id = p_order_id;
  IF NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = p_order_id AND oi.status IS DISTINCT FROM 'cancelled'
                   AND oi.refund_id IS NULL AND NOT (oi.id = ANY(v_ids))) THEN
    v_amount := v_order.total - v_prev;            -- last refund: refunds add up exactly to what was paid
  ELSE
    SELECT COALESCE(SUM(subtotal) FILTER (WHERE id = ANY(v_ids)), 0), COALESCE(SUM(subtotal), 0) INTO v_sel, v_all
      FROM order_items WHERE order_id = p_order_id AND status IS DISTINCT FROM 'cancelled';
    v_amount := LEAST(round(v_order.total * v_sel / NULLIF(v_all, 0), 2), v_order.total - v_prev);
  END IF;
  IF v_amount IS NULL OR v_amount <= 0 THEN RAISE EXCEPTION 'Nothing left to refund'; END IF;

  IF p_method = 'account' THEN       -- pay_order allows one account per bill
    SELECT e.account_id, SUM(e.amount) INTO v_acct, v_charged FROM debt_entries e
     WHERE e.order_id = p_order_id AND e.branch_id = p_branch_id AND e.kind = 'charge'
     GROUP BY e.account_id LIMIT 1;
    IF v_acct IS NULL THEN
      RAISE EXCEPTION 'This bill was not charged to a customer account — choose cash, card or QR';
    END IF;
    IF v_amount > v_charged - (SELECT COALESCE(SUM(r.amount), 0) FROM refunds r
                               WHERE r.order_id = p_order_id AND r.method = 'account') + 0.005 THEN
      RAISE EXCEPTION 'The refund is more than is left on the customer account for this bill — refund the rest by cash, card or QR';
    END IF;
  END IF;

  v_id := 'ref-' || substr(public._random_token(), 1, 20);
  INSERT INTO refunds(id, branch_id, order_id, item_ids, amount, method, reason, refunded_by_id, refunded_by_name)
  VALUES (v_id, p_branch_id, p_order_id, v_ids, v_amount, p_method, v_reason, p_actor_id, p_actor_name);
  UPDATE order_items SET refund_id = v_id WHERE id = ANY(v_ids);
  IF v_acct IS NOT NULL THEN         -- a negative adjustment lowers the balance (see 0036 _debt_balance)
    INSERT INTO debt_entries (branch_id, account_id, kind, amount, order_id, note, created_by, created_by_name)
    VALUES (p_branch_id, v_acct, 'adjustment', -v_amount, p_order_id,
            'Refund bill ' || COALESCE(v_order.bill_number, '?'), p_actor_id, p_actor_name);
  END IF;

  RETURN jsonb_build_object('refund_id', v_id, 'amount', v_amount, 'item_ids', to_jsonb(v_ids));
END; $$;
REVOKE ALL ON FUNCTION public.refund_order(TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refund_order(TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ── Reports: 0039's get_sales_summary + refunds ──────────────
CREATE OR REPLACE FUNCTION public.get_sales_summary(
  p_branch_id TEXT, p_from TIMESTAMPTZ, p_to TIMESTAMPTZ, p_tz TEXT DEFAULT 'Asia/Kuala_Lumpur'
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tz TEXT := COALESCE(NULLIF(p_tz, ''), 'Asia/Kuala_Lumpur'); v_d1 DATE; v_d2 DATE;
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);
  IF p_to <= p_from THEN RAISE EXCEPTION 'Invalid date range'; END IF;
  IF p_to - p_from > interval '400 days' THEN RAISE EXCEPTION 'Please choose a range of about a year or less'; END IF;
  PERFORM now() AT TIME ZONE v_tz;      -- rejects an unknown timezone name early
  v_d1 := (p_from AT TIME ZONE v_tz)::date;
  v_d2 := ((p_to - interval '1 millisecond') AT TIME ZONE v_tz)::date;

  RETURN (
    WITH done AS (
      SELECT o.id, o.total, o.tax, o.discount, o.order_type, o.completed_at
      FROM orders o
      WHERE o.branch_id = p_branch_id AND o.status = 'completed'
        AND o.completed_at >= p_from AND o.completed_at < p_to
    ),
    arch AS (SELECT * FROM sales_daily s WHERE s.branch_id = p_branch_id AND s.day BETWEEN v_d1 AND v_d2)
    SELECT jsonb_build_object(
      'revenue',  COALESCE((SELECT SUM(total) FROM done), 0) + COALESCE((SELECT SUM(revenue) FROM arch), 0),
      'tax',      COALESCE((SELECT SUM(tax) FROM done), 0) + COALESCE((SELECT SUM(tax) FROM arch), 0),
      'discount', COALESCE((SELECT SUM(discount) FROM done), 0) + COALESCE((SELECT SUM(discount) FROM arch), 0),
      'orders',   (SELECT COUNT(*) FROM done) + COALESCE((SELECT SUM(orders) FROM arch), 0),
      'items',    COALESCE((SELECT SUM(oi.quantity) FROM order_items oi JOIN done d ON d.id = oi.order_id
                            WHERE oi.status IS DISTINCT FROM 'cancelled'), 0) + COALESCE((SELECT SUM(items) FROM arch), 0),
      'expenses', COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.branch_id = p_branch_id
                            AND e.date >= v_d1 AND e.date <= v_d2), 0),
      'by_type',  COALESCE((SELECT jsonb_object_agg(t, n) FROM (SELECT t, SUM(n) n FROM (
                     SELECT COALESCE(order_type, 'dine-in') t, COUNT(*)::numeric n FROM done GROUP BY 1
                     UNION ALL SELECT k, v::numeric FROM arch, jsonb_each_text(arch.by_type) AS j(k, v)) u GROUP BY t) x), '{}'::jsonb),
      'by_method', COALESCE((SELECT jsonb_object_agg(m, a) FROM (SELECT m, SUM(a) a FROM (
                     SELECT op.method m, SUM(op.amount) a FROM order_payments op JOIN done d ON d.id = op.order_id GROUP BY 1
                     UNION ALL SELECT k, v::numeric FROM arch, jsonb_each_text(arch.by_method) AS j(k, v)) u GROUP BY m) x), '{}'::jsonb),
      'by_day',   COALESCE((SELECT jsonb_agg(jsonb_build_object('day', day, 'revenue', rev, 'orders', n) ORDER BY day) FROM (
                     SELECT day, SUM(rev) rev, SUM(n) n FROM (
                       SELECT to_char(completed_at AT TIME ZONE v_tz, 'YYYY-MM-DD') AS day, SUM(total) rev, COUNT(*) n FROM done GROUP BY 1
                       UNION ALL SELECT to_char(arch.day, 'YYYY-MM-DD'), arch.revenue, arch.orders FROM arch) u GROUP BY day) x), '[]'::jsonb),
      -- counted on the day the refund is made; 'revenue' stays gross (the app shows revenue − refunds)
      'refunds',  COALESCE((SELECT SUM(r.amount) FROM refunds r WHERE r.branch_id = p_branch_id
                            AND r.created_at >= p_from AND r.created_at < p_to), 0),
      'refunds_by_method', COALESCE((SELECT jsonb_object_agg(method, a) FROM (
                     SELECT r.method, SUM(r.amount) a FROM refunds r WHERE r.branch_id = p_branch_id
                       AND r.created_at >= p_from AND r.created_at < p_to GROUP BY 1) x), '{}'::jsonb)
    ));
END; $$;
REVOKE ALL ON FUNCTION public.get_sales_summary(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sales_summary(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;

-- ── Reports: 0047's get_detail_report + refunds ──────────────
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
    ),
    refunded AS (
      SELECT r.*, o.bill_number, o.table_number, o.order_type
      FROM refunds r JOIN orders o ON o.id = r.order_id
      WHERE r.branch_id = p_branch_id AND r.created_at >= p_from AND r.created_at < p_to
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
              FROM dropped ORDER BY created_at DESC LIMIT 100) y), '[]'::jsonb)),
      'refunds', jsonb_build_object(
          'count', (SELECT COUNT(*) FROM refunded),
          'total', COALESCE((SELECT SUM(amount) FROM refunded), 0),
          'list', COALESCE((SELECT jsonb_agg(x ORDER BY x->>'at' DESC) FROM (
              SELECT jsonb_build_object('at', created_at, 'bill', bill_number, 'table', table_number, 'type', order_type,
                                        'amount', amount, 'method', method, 'reason', reason, 'by', refunded_by_name,
                                        'items', COALESCE((SELECT jsonb_agg(oi.product_name ORDER BY oi.id) FROM order_items oi
                                                           WHERE oi.id = ANY(refunded.item_ids)), '[]'::jsonb)) x
              FROM refunded ORDER BY created_at DESC LIMIT 300) y), '[]'::jsonb))
    )
  );
END; $$;
REVOKE ALL ON FUNCTION public.get_detail_report(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_detail_report(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ROLLBACK (manual): re-run 0039 §3 (get_sales_summary) and 0047 (get_detail_report);
--   DROP FUNCTION public.refund_order(TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT);
--   ALTER TABLE order_items DROP COLUMN refund_id; DROP TABLE public.refunds;
