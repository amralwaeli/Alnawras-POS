-- ============================================================
-- 0028_lock_control_plane.sql   (audit AUD-02 — privilege escalation)
--
-- The four tables that decide WHO IS WHO were as open as every other table:
--
--   super_admins   — a row here makes an account a super-admin
--   branch_logins  — a row here makes an account a branch's website admin
--   organizations  — tenants
--   branches       — contract dates, suspension, enabled (paid) modules
--
-- With the public key anyone could insert themselves into the first two, or
-- extend their own contract in the last. This turns Row-Level Security on for
-- just these four tables. It is deliberately NOT the full Auth + RLS cutover:
-- nothing the staff app does day to day touches these tables directly, so this
-- can ship on its own without locking anyone out.
--
-- What still works, and why:
--   * is_current_user_super_admin(), device_login_required(),
--     current_device_branch()          — SECURITY DEFINER, run as the table
--                                        owner, unaffected by RLS.
--   * admin-invite-tenant / set-tenant-password Edge Functions
--                                      — service role, bypasses RLS.
--   * Super-admin panel (list / create / suspend / edit)
--                                      — signed-in super-admin passes the
--                                        policies below.
--   * BranchController.getAccess (staff login + customer pages)
--                                      — `branches` stays readable.
--
-- Safe & reversible: no data is changed. Idempotent. Run AFTER 0024.
-- ============================================================

-- ── super_admins / branch_logins: no direct access at all ────
-- No policies on purpose. Everything legitimate goes through the SECURITY
-- DEFINER functions or the service role. The REVOKE is belt and braces so a
-- future "temporarily disable RLS" does not silently reopen them.
ALTER TABLE super_admins  ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_logins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON super_admins, branch_logins FROM anon, authenticated;

-- ── organizations: super-admin only ──────────────────────────
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_super_admin ON organizations;
CREATE POLICY organizations_super_admin ON organizations
  FOR ALL TO authenticated
  USING      ((SELECT public.is_current_user_super_admin()))
  WITH CHECK ((SELECT public.is_current_user_super_admin()));

-- ── branches: everyone may read, only a super-admin may write ─
-- Read stays open because the app checks a branch's contract/suspension before
-- anyone is signed in (PIN screen, customer QR and pickup pages). Narrowing the
-- read to "your own branch" is part of the full cutover.
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS branches_read ON branches;
CREATE POLICY branches_read ON branches
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS branches_super_admin_write ON branches;
CREATE POLICY branches_super_admin_write ON branches
  FOR ALL TO authenticated
  USING      ((SELECT public.is_current_user_super_admin()))
  WITH CHECK ((SELECT public.is_current_user_super_admin()));

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- VERIFY (run after applying; all read-only)
--
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('super_admins','branch_logins','organizations','branches');
--   -- expect relrowsecurity = true for all four
--
--   SELECT tablename, policyname, cmd, roles FROM pg_policies
--    WHERE tablename IN ('super_admins','branch_logins','organizations','branches')
--    ORDER BY 1, 2;
--   -- expect exactly: branches_read, branches_super_admin_write,
--   --                 organizations_super_admin
--
-- ROLLBACK (manual — reopens the hole, use only if the panel is locked out)
--
--   ALTER TABLE super_admins  DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE branch_logins DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE branches      DISABLE ROW LEVEL SECURITY;
--   GRANT ALL ON super_admins, branch_logins TO anon, authenticated;
--   NOTIFY pgrst, 'reload schema';
-- ============================================================
