-- ============================================================
-- 0039_cleanup_and_archive.sql   (owner decisions of 2026-11-21)
--
-- Keeps the database inside the Supabase Free plan (500 MB) for years:
--  1. cleanup_temporary_data(), nightly: failed-PIN records > 1 day, customer QR
--     sessions > 30 days, closed QR parties > 90 days, finished pickup links
--     > 30 days, used/expired invites > 30 days, activity log > 24 months.
--     Never touches orders, payments, debts, documents, attendance or payroll.
--  2. archive_if_needed(), monthly: only when the database is over 400 MB (80%),
--     every full month older than the last 6 months is archived: its bills
--     (with lines and payments) are stored compressed in order_archive (one row
--     per branch and month, downloadable), its daily and per-product totals go
--     to sales_daily / product_sales_daily (so reports keep showing them), and
--     the original rows are removed — all in one transaction.
--  3. get_sales_summary and product sales include the archived totals; product
--     sales now count a bill on the day it was paid (as the sales summary does).
--  4. db_usage(): database and file storage use against the free limits.
-- The schedules use pg_cron (free); they are skipped where pg_cron is unavailable.
-- ============================================================

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_cron is not available here; schedules skipped';
END $$;

-- ── 1. Temporary data ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_temporary_data() RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r JSONB := '{}'::jsonb; n INT; s RECORD;
BEGIN
  FOR s IN SELECT * FROM (VALUES
    ('pin_attempts',   $q$DELETE FROM pin_attempts WHERE attempted_at < now() - interval '1 day'$q$),
    ('guest_sessions', $q$DELETE FROM guest_sessions WHERE COALESCE(last_seen, created_at) < now() - interval '30 days'$q$),
    ('order_groups',   $q$DELETE FROM order_groups g WHERE g.status = 'closed' AND COALESCE(g.closed_at, g.created_at) < now() - interval '90 days'
                          AND NOT EXISTS (SELECT 1 FROM guest_sessions gs WHERE gs.group_id = g.id)$q$),
    ('pickup_tokens',  $q$DELETE FROM pickup_tokens WHERE created_at < now() - interval '30 days' AND (NOT active OR expires_at < now())$q$),
    ('tenant_invites', $q$DELETE FROM tenant_invites WHERE COALESCE(used_at, expires_at) < now() - interval '30 days'$q$),
    ('audit_logs',     $q$DELETE FROM audit_logs WHERE created_at < now() - interval '24 months'$q$)
  ) AS t(name, stmt) LOOP
    BEGIN
      EXECUTE s.stmt; GET DIAGNOSTICS n = ROW_COUNT;
      r := r || jsonb_build_object(s.name, n);
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;   -- older install
    END;
  END LOOP;
  RETURN r;
END; $$;
REVOKE ALL ON FUNCTION public.cleanup_temporary_data() FROM PUBLIC, anon, authenticated;

-- ── 2. Archive ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_daily (
  branch_id TEXT NOT NULL,
  day       DATE NOT NULL,                     -- the restaurant's local day
  revenue   NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax       NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount  NUMERIC(14,2) NOT NULL DEFAULT 0,
  orders    INT NOT NULL DEFAULT 0,
  items     INT NOT NULL DEFAULT 0,
  by_type   JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {"dine-in": 12, …}
  by_method JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {"cash": 120.50, …}
  PRIMARY KEY (branch_id, day)
);
CREATE TABLE IF NOT EXISTS product_sales_daily (
  branch_id    TEXT NOT NULL,
  day          DATE NOT NULL,
  product_id   TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity     INT NOT NULL DEFAULT 0,
  revenue      NUMERIC(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (branch_id, day, product_id, product_name)
);
CREATE TABLE IF NOT EXISTS order_archive (
  branch_id   TEXT NOT NULL,
  month       DATE NOT NULL,                   -- first day of the month
  order_count INT NOT NULL,
  revenue     NUMERIC(14,2) NOT NULL DEFAULT 0,
  data        JSONB NOT NULL,                  -- every bill with its lines and payments (stored compressed)
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (branch_id, month)
);
DO $$ BEGIN
  ALTER TABLE order_archive ALTER COLUMN data SET COMPRESSION lz4;
EXCEPTION WHEN OTHERS THEN NULL;   -- default compression where lz4 isn't built in
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sales_daily', 'product_sales_daily', 'order_archive'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS branch_read ON %I', t);
    EXECUTE format('CREATE POLICY branch_read ON %I FOR SELECT TO authenticated USING (branch_id = (SELECT public.current_device_branch()))', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON %I FROM authenticated', t);   -- written only by the archive
    EXECUTE format('GRANT SELECT ON %I TO authenticated', t);
  END LOOP;
END $$;

-- One branch, one month: totals + compressed copy + removal, in the caller's transaction.
CREATE OR REPLACE FUNCTION public._archive_month(p_branch_id TEXT, p_month DATE, p_tz TEXT DEFAULT 'Asia/Kuala_Lumpur')
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE v_from TIMESTAMPTZ; v_to TIMESTAMPTZ; v_n INT;
BEGIN
  v_from := (date_trunc('month', p_month)::timestamp) AT TIME ZONE p_tz;
  v_to   := ((date_trunc('month', p_month) + interval '1 month')::timestamp) AT TIME ZONE p_tz;

  CREATE TEMP TABLE IF NOT EXISTS _arch (id TEXT PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE _arch;
  -- Paid bills by the day they were paid; cancelled ones by the day they were opened. Never open bills.
  INSERT INTO _arch SELECT o.id FROM orders o
   WHERE o.branch_id = p_branch_id AND o.status <> 'open'
     AND COALESCE(CASE WHEN o.status = 'completed' THEN o.completed_at END, o.created_at) >= v_from
     AND COALESCE(CASE WHEN o.status = 'completed' THEN o.completed_at END, o.created_at) <  v_to;
  SELECT count(*) INTO v_n FROM _arch;
  IF v_n = 0 THEN RETURN 0; END IF;

  -- Daily totals (completed bills only), added to any already there.
  INSERT INTO sales_daily AS sd (branch_id, day, revenue, tax, discount, orders, items, by_type, by_method)
  SELECT p_branch_id, d.day, d.revenue, d.tax, d.discount, d.orders,
         COALESCE(i.items, 0), COALESCE(t.by_type, '{}'::jsonb), COALESCE(m.by_method, '{}'::jsonb)
    FROM (SELECT (o.completed_at AT TIME ZONE p_tz)::date AS day, SUM(o.total) revenue, SUM(o.tax) tax,
                 SUM(o.discount) discount, COUNT(*) orders
            FROM orders o JOIN _arch a ON a.id = o.id WHERE o.status = 'completed' GROUP BY 1) d
    LEFT JOIN (SELECT (o.completed_at AT TIME ZONE p_tz)::date AS day, SUM(oi.quantity) items
                 FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN _arch a ON a.id = o.id
                WHERE o.status = 'completed' AND oi.status IS DISTINCT FROM 'cancelled' GROUP BY 1) i ON i.day = d.day
    LEFT JOIN (SELECT day, jsonb_object_agg(t, n) by_type FROM (
                 SELECT (o.completed_at AT TIME ZONE p_tz)::date AS day, COALESCE(o.order_type, 'dine-in') t, COUNT(*) n
                   FROM orders o JOIN _arch a ON a.id = o.id WHERE o.status = 'completed' GROUP BY 1, 2) x GROUP BY day) t ON t.day = d.day
    LEFT JOIN (SELECT day, jsonb_object_agg(m, amt) by_method FROM (
                 SELECT (o.completed_at AT TIME ZONE p_tz)::date AS day, op.method m, SUM(op.amount) amt
                   FROM order_payments op JOIN orders o ON o.id = op.order_id JOIN _arch a ON a.id = o.id
                  WHERE o.status = 'completed' GROUP BY 1, 2) x GROUP BY day) m ON m.day = d.day
  ON CONFLICT (branch_id, day) DO UPDATE SET
    revenue = sd.revenue + EXCLUDED.revenue, tax = sd.tax + EXCLUDED.tax, discount = sd.discount + EXCLUDED.discount,
    orders = sd.orders + EXCLUDED.orders, items = sd.items + EXCLUDED.items,
    by_type = (SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb) FROM (
                 SELECT k, SUM(v::numeric) v FROM (SELECT * FROM jsonb_each_text(sd.by_type) UNION ALL SELECT * FROM jsonb_each_text(EXCLUDED.by_type)) e(k, v) GROUP BY k) z),
    by_method = (SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb) FROM (
                 SELECT k, SUM(v::numeric) v FROM (SELECT * FROM jsonb_each_text(sd.by_method) UNION ALL SELECT * FROM jsonb_each_text(EXCLUDED.by_method)) e(k, v) GROUP BY k) z);

  INSERT INTO product_sales_daily AS ps (branch_id, day, product_id, product_name, quantity, revenue)
  SELECT p_branch_id, (o.completed_at AT TIME ZONE p_tz)::date, COALESCE(oi.product_id, ''), COALESCE(oi.product_name, ''),
         SUM(oi.quantity), SUM(oi.subtotal)
    FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN _arch a ON a.id = o.id
   WHERE o.status = 'completed' AND oi.status IS DISTINCT FROM 'cancelled'
   GROUP BY 2, 3, 4
  ON CONFLICT (branch_id, day, product_id, product_name) DO UPDATE SET
    quantity = ps.quantity + EXCLUDED.quantity, revenue = ps.revenue + EXCLUDED.revenue;

  -- The full bills, compressed (appended if this month was partly archived before).
  INSERT INTO order_archive AS oa (branch_id, month, order_count, revenue, data)
  SELECT p_branch_id, date_trunc('month', p_month)::date, v_n,
         COALESCE(SUM(o.total) FILTER (WHERE o.status = 'completed'), 0),
         jsonb_agg(to_jsonb(o) || jsonb_build_object(
           'items',    COALESCE((SELECT jsonb_agg(to_jsonb(oi) ORDER BY oi.id) FROM order_items oi WHERE oi.order_id = o.id), '[]'::jsonb),
           'payments', COALESCE((SELECT jsonb_agg(to_jsonb(op) ORDER BY op.id) FROM order_payments op WHERE op.order_id = o.id), '[]'::jsonb))
           ORDER BY o.created_at)
    FROM orders o JOIN _arch a ON a.id = o.id
  ON CONFLICT (branch_id, month) DO UPDATE SET
    order_count = oa.order_count + EXCLUDED.order_count, revenue = oa.revenue + EXCLUDED.revenue,
    data = oa.data || EXCLUDED.data, archived_at = NOW();

  -- Remove the originals. Lines of a sold bill must not give stock back on delete (0035 trigger).
  UPDATE order_items oi SET stock_taken = false FROM _arch a WHERE oi.order_id = a.id AND oi.stock_taken;
  UPDATE pickup_tokens pt SET order_id = NULL FROM _arch a WHERE pt.order_id = a.id;
  UPDATE tables t SET current_order_id = NULL FROM _arch a WHERE t.current_order_id = a.id;
  DELETE FROM order_payments op USING _arch a WHERE op.order_id = a.id;
  DELETE FROM order_items oi USING _arch a WHERE oi.order_id = a.id;
  DELETE FROM orders o USING _arch a WHERE o.id = a.id;
  RETURN v_n;
END; $$;
REVOKE ALL ON FUNCTION public._archive_month(TEXT, DATE, TEXT) FROM PUBLIC, anon, authenticated;

-- Monthly: only above p_limit_bytes; archives every full month older than the last p_keep_months.
CREATE OR REPLACE FUNCTION public.archive_if_needed(
  p_limit_bytes BIGINT DEFAULT 400 * 1024 * 1024, p_keep_months INT DEFAULT 6, p_tz TEXT DEFAULT 'Asia/Kuala_Lumpur'
) RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cut DATE; v_total INT := 0; r RECORD;
BEGIN
  IF pg_database_size(current_database()) < p_limit_bytes THEN RETURN 0; END IF;
  v_cut := (date_trunc('month', now() AT TIME ZONE p_tz) - make_interval(months => GREATEST(p_keep_months, 3)))::date;
  FOR r IN
    SELECT DISTINCT o.branch_id, date_trunc('month', COALESCE(CASE WHEN o.status = 'completed' THEN o.completed_at END, o.created_at) AT TIME ZONE p_tz)::date AS m
      FROM orders o
     WHERE o.status <> 'open'
       AND COALESCE(CASE WHEN o.status = 'completed' THEN o.completed_at END, o.created_at) < (v_cut::timestamp AT TIME ZONE p_tz)
     ORDER BY 2, 1
  LOOP
    v_total := v_total + public._archive_month(r.branch_id, r.m, p_tz);
  END LOOP;
  RETURN v_total;
END; $$;
REVOKE ALL ON FUNCTION public.archive_if_needed(BIGINT, INT, TEXT) FROM PUBLIC, anon, authenticated;

-- ── 3. Reports include archived totals ───────────────────────
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
                       UNION ALL SELECT to_char(arch.day, 'YYYY-MM-DD'), arch.revenue, arch.orders FROM arch) u GROUP BY day) x), '[]'::jsonb)
    ));
END; $$;

CREATE OR REPLACE FUNCTION public._get_product_sales_impl(p_branch_id TEXT, p_date_from TIMESTAMPTZ, p_date_to TIMESTAMPTZ)
RETURNS TABLE (product_id TEXT, product_name TEXT, units_sold BIGINT, revenue NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.product_id, u.product_name, SUM(u.q)::BIGINT AS units_sold, SUM(u.r)::NUMERIC AS revenue
  FROM (
    SELECT oi.product_id, oi.product_name, oi.quantity AS q, oi.subtotal AS r
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.branch_id = p_branch_id AND o.status = 'completed'
       AND o.completed_at >= p_date_from AND o.completed_at < p_date_to
       AND oi.status IS DISTINCT FROM 'cancelled'
    UNION ALL
    SELECT ps.product_id, ps.product_name, ps.quantity, ps.revenue
      FROM product_sales_daily ps
     WHERE ps.branch_id = p_branch_id
       AND ps.day BETWEEN (p_date_from AT TIME ZONE 'Asia/Kuala_Lumpur')::date
                      AND ((p_date_to - interval '1 millisecond') AT TIME ZONE 'Asia/Kuala_Lumpur')::date
  ) u
  GROUP BY u.product_id, u.product_name
  ORDER BY units_sold DESC;
$$;
REVOKE ALL ON FUNCTION public._get_product_sales_impl(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

-- ── 4. Usage against the free limits ─────────────────────────
CREATE OR REPLACE FUNCTION public.db_usage() RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_storage BIGINT := 0;
BEGIN
  IF public.current_device_branch() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  BEGIN
    SELECT COALESCE(SUM((metadata->>'size')::bigint), 0) INTO v_storage FROM storage.objects;
  EXCEPTION WHEN OTHERS THEN v_storage := 0;
  END;
  RETURN jsonb_build_object(
    'db_bytes', pg_database_size(current_database()), 'db_limit', 500 * 1024 * 1024,
    'storage_bytes', v_storage, 'storage_limit', 1024 * 1024 * 1024);
END; $$;
REVOKE ALL ON FUNCTION public.db_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.db_usage() TO authenticated;

-- ── Schedules (UTC; Malaysia is UTC+8) ───────────────────────
DO $$ BEGIN
  IF to_regnamespace('cron') IS NOT NULL THEN
    PERFORM cron.schedule('pos-cleanup', '30 20 * * *', 'SELECT public.cleanup_temporary_data()');   -- 04:30 daily
    PERFORM cron.schedule('pos-archive', '40 20 1 * *', 'SELECT public.archive_if_needed()');        -- 04:40 on the 1st
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ROLLBACK (manual): SELECT cron.unschedule('pos-cleanup'); SELECT cron.unschedule('pos-archive');
--   re-run 0033 (get_sales_summary) and 0031 (_get_product_sales_impl);
--   DROP FUNCTION public.db_usage(), public.archive_if_needed(BIGINT, INT, TEXT),
--     public._archive_month(TEXT, DATE, TEXT), public.cleanup_temporary_data();
--   (keep sales_daily / product_sales_daily / order_archive — they hold archived history)
