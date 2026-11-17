-- ============================================================
-- 0032_enable_rls.sql   (Batch 2d — audit AUD-01: real tenant isolation)
--
-- Turns Row-Level Security ON for every app table. After this:
--   * A signed-in branch device (website admin login, or the installed app's
--     branch login) sees and changes ONLY rows of its own branch:
--       branch_id = current_device_branch()        (0024)
--   * Anonymous visitors (customers) can read only active menus
--     (products, categories, modifiers) and the branch registry (0028).
--     Everything else they do goes through the token-checked functions (0029).
--   * Bookkeeping tables (bill_counters, pin_attempts) are functions-only.
--   * A row that points at another row (a bill line → its bill, a bill → its
--     table, …) must point at a row of the same branch.
--   * Payment and loyalty history can't be edited from a device; the audit log
--     is append-only; a paid bill and its lines can't be changed or deleted.
--   * Uploads of menu photos / the merchant payment QR need a branch device and
--     its own file name; customers can still upload pickup receipts, but nobody
--     can list the receipts bucket.
-- Functions (SECURITY DEFINER) and the Edge Functions (service role) are not
-- affected: they run as the table owner.
--
-- ⚠️ APPLY LAST, after 0029–0031 AND after the matching client is deployed.
-- Every staff device must be signed in with a branch login.
-- ROLLBACK (instant, at the bottom): disable RLS per table.
-- Idempotent.
-- ============================================================

-- Same-branch rule for a branch table. `link` (optional) is an extra SQL check on
-- the NEW row: rows that point at a parent (an order, a table, a customer…) must
-- point at a parent of the SAME branch. Without it a device could plant a line on
-- another branch's bill, because foreign-key checks ignore RLS.
CREATE OR REPLACE FUNCTION pg_temp.branch_policy(t TEXT, link TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql AS $f$
DECLARE chk TEXT := 'branch_id = (SELECT public.current_device_branch())';
BEGIN
  IF to_regclass('public.' || t) IS NULL THEN RETURN; END IF;     -- a migration not applied yet
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('DROP POLICY IF EXISTS branch_isolation ON public.%I', t);
  EXECUTE format('CREATE POLICY branch_isolation ON public.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
                 t, chk, chk || COALESCE(' AND ' || link, ''));
END $f$;

-- "col is empty, or names a row of <parent> in the caller's own branch"
CREATE OR REPLACE FUNCTION pg_temp.same_branch(col TEXT, parent TEXT, pk TEXT DEFAULT 'id')
RETURNS TEXT LANGUAGE sql AS $f$
  SELECT format('(%1$s IS NULL OR EXISTS (SELECT 1 FROM public.%2$I p WHERE p.%3$I = %1$s AND p.branch_id = (SELECT public.current_device_branch())))',
                col, parent, pk);
$f$;

SELECT pg_temp.branch_policy(t) FROM unnest(ARRAY[
  'users', 'categories', 'tables', 'expenses', 'customers', 'ingredient_orders', 'employees',
  'attendance_logs', 'payroll_summary', 'leave_requests', 'modifier_groups', 'branch_settings',
  'shifts', 'employee_performance_observations']) AS t;

SELECT pg_temp.branch_policy('products',     pg_temp.same_branch('category_id', 'categories'));
SELECT pg_temp.branch_policy('orders',       pg_temp.same_branch('table_id', 'tables'));
SELECT pg_temp.branch_policy('order_items',  pg_temp.same_branch('order_id', 'orders') || ' AND ' || pg_temp.same_branch('product_id', 'products'));
SELECT pg_temp.branch_policy('qr_sessions',  pg_temp.same_branch('table_id', 'tables'));
SELECT pg_temp.branch_policy('order_groups', pg_temp.same_branch('table_id', 'tables') || ' AND ' || pg_temp.same_branch('order_id', 'orders'));
SELECT pg_temp.branch_policy('guest_sessions', pg_temp.same_branch('group_id', 'order_groups') || ' AND ' || pg_temp.same_branch('table_id', 'tables'));
SELECT pg_temp.branch_policy('pickup_tokens', pg_temp.same_branch('order_id', 'orders'));
SELECT pg_temp.branch_policy('audit_logs');
SELECT pg_temp.branch_policy('order_payments', pg_temp.same_branch('order_id', 'orders'));
SELECT pg_temp.branch_policy('loyalty_transactions', pg_temp.same_branch('customer_id', 'customers') || ' AND ' || pg_temp.same_branch('order_id', 'orders'));

-- ── History is not rewritable from a device ──────────────────
-- Payments and loyalty history are written only by the server functions; the
-- audit log may be appended to but not edited. A paid bill (and its lines) can no
-- longer be changed or deleted directly — only an OPEN bill can.
DROP POLICY IF EXISTS branch_isolation ON order_payments;
CREATE POLICY branch_read ON order_payments FOR SELECT TO authenticated
  USING (branch_id = (SELECT public.current_device_branch()));
DROP POLICY IF EXISTS branch_isolation ON loyalty_transactions;
CREATE POLICY branch_read ON loyalty_transactions FOR SELECT TO authenticated
  USING (branch_id = (SELECT public.current_device_branch()));
DROP POLICY IF EXISTS branch_isolation ON audit_logs;
CREATE POLICY branch_read ON audit_logs FOR SELECT TO authenticated
  USING (branch_id = (SELECT public.current_device_branch()));
CREATE POLICY branch_append ON audit_logs FOR INSERT TO authenticated
  WITH CHECK (branch_id = (SELECT public.current_device_branch()));

DROP POLICY IF EXISTS branch_isolation ON orders;
CREATE POLICY branch_read   ON orders FOR SELECT TO authenticated USING (branch_id = (SELECT public.current_device_branch()));
DO $$ BEGIN
  EXECUTE 'CREATE POLICY branch_insert ON orders FOR INSERT TO authenticated WITH CHECK (branch_id = (SELECT public.current_device_branch()) AND '
          || pg_temp.same_branch('table_id', 'tables') || ')';
  EXECUTE 'CREATE POLICY branch_update_open ON orders FOR UPDATE TO authenticated '
          || 'USING (branch_id = (SELECT public.current_device_branch()) AND status = ''open'') '
          || 'WITH CHECK (branch_id = (SELECT public.current_device_branch()) AND ' || pg_temp.same_branch('table_id', 'tables') || ')';
  EXECUTE 'CREATE POLICY branch_delete_open ON orders FOR DELETE TO authenticated '
          || 'USING (branch_id = (SELECT public.current_device_branch()) AND status = ''open'')';

  EXECUTE 'DROP POLICY IF EXISTS branch_isolation ON order_items';
  EXECUTE 'CREATE POLICY branch_read ON order_items FOR SELECT TO authenticated USING (branch_id = (SELECT public.current_device_branch()))';
  EXECUTE 'CREATE POLICY branch_insert ON order_items FOR INSERT TO authenticated WITH CHECK (branch_id = (SELECT public.current_device_branch()) AND '
          || pg_temp.same_branch('order_id', 'orders') || ' AND ' || pg_temp.same_branch('product_id', 'products') || ')';
  -- lines of an OPEN bill only (kitchen status changes, voids)
  EXECUTE 'CREATE POLICY branch_update_open ON order_items FOR UPDATE TO authenticated '
          || 'USING (branch_id = (SELECT public.current_device_branch()) AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.status = ''open'')) '
          || 'WITH CHECK (branch_id = (SELECT public.current_device_branch()) AND ' || pg_temp.same_branch('order_id', 'orders') || ')';
  EXECUTE 'CREATE POLICY branch_delete_open ON order_items FOR DELETE TO authenticated '
          || 'USING (branch_id = (SELECT public.current_device_branch()) AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.status = ''open''))';
END $$;

-- ── Tables without their own branch_id: scope through the parent row ──
ALTER TABLE modifier_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS branch_isolation ON modifier_options;
CREATE POLICY branch_isolation ON modifier_options FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM modifier_groups g WHERE g.id = group_id AND g.branch_id = (SELECT public.current_device_branch())))
  WITH CHECK (EXISTS (SELECT 1 FROM modifier_groups g WHERE g.id = group_id AND g.branch_id = (SELECT public.current_device_branch())));

ALTER TABLE product_modifier_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS branch_isolation ON product_modifier_groups;
CREATE POLICY branch_isolation ON product_modifier_groups FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM products p WHERE p.id = product_id AND p.branch_id = (SELECT public.current_device_branch())))
  WITH CHECK (EXISTS (SELECT 1 FROM products p WHERE p.id = product_id AND p.branch_id = (SELECT public.current_device_branch()))
          AND EXISTS (SELECT 1 FROM modifier_groups g WHERE g.id = group_id AND g.branch_id = (SELECT public.current_device_branch())));

ALTER TABLE employee_fingerprints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS branch_isolation ON employee_fingerprints;
CREATE POLICY branch_isolation ON employee_fingerprints FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM employees e WHERE e.employee_id = employee_fingerprints.employee_id AND e.branch_id = (SELECT public.current_device_branch())))
  WITH CHECK (EXISTS (SELECT 1 FROM employees e WHERE e.employee_id = employee_fingerprints.employee_id AND e.branch_id = (SELECT public.current_device_branch())));

-- Tables found on production that no migration creates (created by hand earlier).
-- printers carries branch_id; shift_rules hangs off an employee.
SELECT pg_temp.branch_policy('printers');
DO $$ BEGIN
  IF to_regclass('public.shift_rules') IS NOT NULL THEN
    ALTER TABLE shift_rules ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS branch_isolation ON shift_rules;
    CREATE POLICY branch_isolation ON shift_rules FOR ALL TO authenticated
      USING      (EXISTS (SELECT 1 FROM employees e WHERE e.employee_id = shift_rules.employee_id AND e.branch_id = (SELECT public.current_device_branch())))
      WITH CHECK (EXISTS (SELECT 1 FROM employees e WHERE e.employee_id = shift_rules.employee_id AND e.branch_id = (SELECT public.current_device_branch())));
  END IF;
END $$;

-- ── Functions-only bookkeeping ───────────────────────────────
ALTER TABLE bill_counters ENABLE ROW LEVEL SECURITY;      -- no policy
REVOKE ALL ON bill_counters FROM anon, authenticated;
REVOKE ALL ON tenant_invites FROM anon, authenticated;   -- already RLS-on with no policy (0025)

-- ── Anonymous visitors: menus + branch registry, read-only ───
-- shortcut: any visitor can read any branch's ACTIVE menu (menus are public by
-- nature); narrow to "the branch of the QR you scanned" via an RPC if a tenant objects.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
GRANT SELECT ON products, categories, modifier_groups, modifier_options, product_modifier_groups, branches TO anon;

DROP POLICY IF EXISTS menu_public_read ON products;
CREATE POLICY menu_public_read ON products FOR SELECT TO anon USING (is_active);
DROP POLICY IF EXISTS menu_public_read ON categories;
CREATE POLICY menu_public_read ON categories FOR SELECT TO anon USING (is_active);
DROP POLICY IF EXISTS menu_public_read ON modifier_groups;
CREATE POLICY menu_public_read ON modifier_groups FOR SELECT TO anon USING (is_active);
DROP POLICY IF EXISTS menu_public_read ON modifier_options;
CREATE POLICY menu_public_read ON modifier_options FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM modifier_groups g WHERE g.id = group_id AND g.is_active));
DROP POLICY IF EXISTS menu_public_read ON product_modifier_groups;
CREATE POLICY menu_public_read ON product_modifier_groups FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM products p WHERE p.id = product_id AND p.is_active));

-- ── Storage ──────────────────────────────────────────────────
-- Uploads of menu photos and the payment QR: a branch device, and only into its
-- OWN name (photos under "<branch>/…", the QR as "<branch>.png") — otherwise one
-- tenant could plant its own payment QR as another tenant's.
DROP POLICY IF EXISTS "product_images_insert" ON storage.objects;
CREATE POLICY "product_images_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND public.current_device_branch() IS NOT NULL
              AND name LIKE public.current_device_branch() || '/%');
DROP POLICY IF EXISTS "merchant_qr_write" ON storage.objects;
CREATE POLICY "merchant_qr_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'merchant-qr' AND public.current_device_branch() IS NOT NULL
              AND name = public.current_device_branch() || '.png');
-- Receipts: customers may still upload (0007/0012 limit type + size), but nobody
-- may LIST the bucket any more — the list API exposed every branch's customer
-- receipts. The bucket is public, so a receipt still opens from its own URL.
DROP POLICY IF EXISTS "pickup_receipts_read" ON storage.objects;

-- ── Anything else in the schema: locked by default ───────────
-- A table nobody has written a policy for is closed to the API (RLS on, no
-- policy) instead of silently left open.
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    RAISE NOTICE 'RLS enabled with no policy (API access closed): %', t;
  END LOOP;
END $$;

-- ── Realtime: never broadcast the staff table ─────────────────
-- Its rows carry pin_hash (a 4-digit PIN's hash cracks in seconds), and Supabase
-- does not apply RLS to DELETE events. The app never subscribes to it.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
             AND schemaname = 'public' AND tablename = 'users') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.users;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- VERIFY (read-only) — every app table should show rowsecurity = true:
--   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY 2, 1;
--
-- ROLLBACK (instant — reopens the database exactly as before this file):
--   DO $$ DECLARE t TEXT; BEGIN
--     FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
--              AND tablename NOT IN ('tenant_invites','pin_attempts','bill_counters','super_admins','branch_logins','organizations','branches')
--     LOOP EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t); END LOOP; END $$;
--   GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
--   -- keep the staff table's PIN columns hidden (0030) — GRANT ALL above re-opened them:
--   REVOKE SELECT, INSERT, UPDATE ON users FROM anon, authenticated;
--   GRANT SELECT (id, name, employment_number, role, email, status, branch_id, hire_date, hourly_rate, job_role, created_at) ON users TO anon, authenticated;
--   GRANT INSERT (id, name, employment_number, role, pin, email, status, branch_id, hire_date, hourly_rate, job_role, created_at) ON users TO anon, authenticated;
--   GRANT UPDATE (name, employment_number, role, pin, email, status, branch_id, hire_date, hourly_rate, job_role) ON users TO anon, authenticated;
--   REVOKE ALL ON bill_counters, pin_attempts, tenant_invites FROM anon, authenticated;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon;
--   NOTIFY pgrst, 'reload schema';
--   Storage policies changed above can stay (they only narrow uploads).
-- ============================================================
