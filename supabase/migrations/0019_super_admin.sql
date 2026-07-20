-- ============================================================
-- 0019_super_admin.sql   (Feature 1B — super-admin identity)
--
-- The super-admin (the person selling the system to restaurants) is NOT a
-- staff role in the PIN-based `users` table. They get their own real Supabase
-- Auth login (email + password), because the super-admin panel must keep
-- working even when a tenant's branch is locked out — it's the tool used to
-- renew/suspend that very branch.
--
-- `super_admins` maps a Supabase Auth user id to super-admin rights. A given
-- authenticated session is a super-admin IFF it has a row here. Small number
-- of accounts, so full Supabase Auth here is cheap and stays on the free plan
-- (Auth is included, up to 50k MAU).
--
-- Additive & safe: adds one table + two read helpers. Nothing existing changes.
-- ============================================================

CREATE TABLE IF NOT EXISTS super_admins (
  auth_uid   TEXT PRIMARY KEY,   -- auth.users.id (UUID as text)
  email      TEXT,
  name       TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Is the CURRENT authenticated caller a super-admin? SECURITY DEFINER so the
-- client can call it right after signing in to decide whether to show the
-- panel, without needing direct read access to the table.
CREATE OR REPLACE FUNCTION public.is_current_user_super_admin()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM super_admins WHERE auth_uid = auth.uid()::text);
$$;

REVOKE ALL ON FUNCTION public.is_current_user_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_super_admin() TO anon, authenticated;

-- ─── PROVISIONING THE FIRST SUPER-ADMIN (manual, one time) ───
-- 1. In the Supabase dashboard: Authentication -> Users -> Add user, create the
--    super-admin's email + password (confirm the email).
-- 2. Copy that user's UID, then run (replacing the placeholders):
--       INSERT INTO super_admins (auth_uid, email, name)
--       VALUES ('<auth-user-uid>', 'you@example.com', 'Owner');
-- After that, signing into the app's /superadmin login with those credentials
-- unlocks the tenant-management panel.

NOTIFY pgrst, 'reload schema';
