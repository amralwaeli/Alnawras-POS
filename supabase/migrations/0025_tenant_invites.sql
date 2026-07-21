-- ============================================================
-- 0025_tenant_invites.sql   (Tenant onboarding — set-password links)
--
-- When the super-admin adds a tenant, the admin-invite-tenant Edge Function
-- creates the org + branch + a login account + a branch_logins mapping, and
-- drops a single-use token here. The emailed link points at /#/set-password?
-- token=..., and the set-tenant-password Edge Function validates the token and
-- sets the account's password.
--
-- Only the Edge Functions (service role) ever touch this table. RLS is turned ON
-- with NO policies so the tokens are NOT readable through the public anon key
-- (service role bypasses RLS). The app never selects from this table directly,
-- so enabling RLS here is safe and does not affect anything else.
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_invites (
  token       TEXT PRIMARY KEY,
  auth_uid    TEXT NOT NULL,
  email       TEXT,
  branch_id   TEXT,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tenant_invites ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: anon/authenticated get nothing; the service-role key
-- used by the Edge Functions bypasses RLS.

NOTIFY pgrst, 'reload schema';
