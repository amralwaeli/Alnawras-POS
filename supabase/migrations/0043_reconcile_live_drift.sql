-- 0043: bring every database to what the migrations and the app expect.
--
-- The live project had hand-made schema changes from before 0001 that the
-- migrations never had, and some broke features there (found by comparing the
-- live catalog with a database built from the migrations, 2026-11-22):
--   * orders.waiters was text[]; guest_submit, pickup_submit and join_table_group
--     write '[]'::jsonb, so every customer QR / group / pickup order failed.
--   * customers.id had no default; the app adds customers without an id.
--   * loyalty_transactions.customer_name was NOT NULL but is never written, so
--     earning and redeeming points failed.
--   * payroll_summary.monthly_salary / employee_fingerprints.enrolled_by were
--     required without a default (the migrations never required them).
-- A fresh project (a one-time customer's own Supabase) has none of that drift but
-- also no realtime tables, which were switched on by hand on the live project.
--
-- Every step checks first, so this is safe to run on any database, any number of times.

DO $$
DECLARE t TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
             AND table_name = 'orders' AND column_name = 'waiters' AND udt_name = '_text') THEN
    ALTER TABLE public.orders ALTER COLUMN waiters DROP DEFAULT;
    ALTER TABLE public.orders ALTER COLUMN waiters TYPE jsonb USING to_jsonb(waiters);
    ALTER TABLE public.orders ALTER COLUMN waiters SET DEFAULT '[]'::jsonb;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
             AND table_name = 'customers' AND column_name = 'id' AND column_default IS NULL) THEN
    EXECUTE format('ALTER TABLE public.customers ALTER COLUMN id SET DEFAULT gen_random_uuid()%s',
      CASE WHEN (SELECT udt_name FROM information_schema.columns WHERE table_schema = 'public'
                 AND table_name = 'customers' AND column_name = 'id') = 'text' THEN '::text' ELSE '' END);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
             AND table_name = 'loyalty_transactions' AND column_name = 'customer_name' AND is_nullable = 'NO') THEN
    ALTER TABLE public.loyalty_transactions ALTER COLUMN customer_name DROP NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
             AND table_name = 'payroll_summary' AND column_name = 'monthly_salary' AND column_default IS NULL) THEN
    ALTER TABLE public.payroll_summary ALTER COLUMN monthly_salary SET DEFAULT 0;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
             AND table_name = 'employee_fingerprints' AND column_name = 'enrolled_by' AND is_nullable = 'NO') THEN
    ALTER TABLE public.employee_fingerprints ALTER COLUMN enrolled_by DROP NOT NULL;
  END IF;

  -- Live updates (RealtimeSyncEngine, kitchen display, attendance) need these tables
  -- in Supabase's realtime publication. Not users: 0032 keeps it out on purpose.
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['orders', 'order_items', 'tables', 'products', 'categories', 'attendance_logs'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
                     AND schemaname = 'public' AND tablename = t) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;
