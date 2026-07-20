-- ============================================================
-- 0018_organizations_branches.sql   (Feature 1A — tenant foundation)
--
-- Turns the loose, unvalidated `branch_id` TEXT column (repeated on every
-- table with no registry behind it) into a real, owned entity so the system
-- can serve many restaurant customers ("tenants") from one deployment
-- instead of copying the whole project per client.
--
--   organizations  — a tenant (the customer being sold to). Owns >=1 branch.
--   branches       — the billable unit (one restaurant location). Its `id` IS
--                    the value that every existing table's `branch_id` already
--                    points at, so nothing else has to change to adopt it.
--
-- Only the super-admin (Feature 1B) ever creates a branch — a tenant never
-- self-serves one, because a branch is the thing being sold.
--
-- This migration is ADDITIVE and SAFE: it adds two tables and backfills them
-- from the branch_id values already in use. It does NOT enable RLS, drop
-- anything, or change how the running app reads/writes — the app keeps working
-- unchanged. RLS-based isolation is a later, separate step (Feature 1D), which
-- must not be applied until staff login is migrated to real Supabase Auth
-- sessions (see SECURITY.md — enabling RLS before that = total outage).
-- ============================================================

-- ─── organizations ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  owner_name  TEXT,
  owner_email TEXT,
  owner_phone TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── branches ────────────────────────────────────────────────
-- `enabled_features` is a JSONB map of module -> bool. Absent/true means the
-- module is visible for that branch; false hides it (Feature 1C). Keys match
-- the confirmed module list.
CREATE TABLE IF NOT EXISTS branches (
  id               TEXT PRIMARY KEY,          -- == branch_id used across all tables
  org_id           TEXT NOT NULL REFERENCES organizations(id),
  name             TEXT NOT NULL,
  contract_start   DATE,
  contract_end     DATE,
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','expired')),
  enabled_features JSONB NOT NULL DEFAULT jsonb_build_object(
                     'loyalty', true, 'workforce', true, 'biometrics', true,
                     'invoices', true, 'pickup', true, 'groupOrdering', true,
                     'reports', true, 'accounting', true
                   ),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_branches_org ON branches(org_id);
CREATE INDEX IF NOT EXISTS idx_branches_contract_end ON branches(contract_end);

-- ─── Backfill from existing data ─────────────────────────────
-- Create a single default organization to own everything that already exists,
-- then one branch row per DISTINCT branch_id actually in use across the core
-- tables — so the current restaurant keeps running with a real registry entry
-- and nothing points at a branch that doesn't exist. Idempotent.
INSERT INTO organizations (id, name, status)
  SELECT 'org-default', 'Alnawras Restaurant Group', 'active'
  WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE id = 'org-default');

INSERT INTO branches (id, org_id, name, status, contract_start)
  SELECT bid, 'org-default', 'Main Branch', 'active', CURRENT_DATE
  FROM (
    SELECT branch_id AS bid FROM users     WHERE branch_id IS NOT NULL
    UNION SELECT branch_id FROM products    WHERE branch_id IS NOT NULL
    UNION SELECT branch_id FROM tables      WHERE branch_id IS NOT NULL
    UNION SELECT branch_id FROM orders      WHERE branch_id IS NOT NULL
  ) d
  WHERE bid IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM branches b WHERE b.id = d.bid);

-- Safety net: if the tables above are all empty (fresh environment), still
-- guarantee the default 'branch-1' the app falls back to exists.
INSERT INTO branches (id, org_id, name, status, contract_start)
  SELECT 'branch-1', 'org-default', 'Main Branch', 'active', CURRENT_DATE
  WHERE NOT EXISTS (SELECT 1 FROM branches);

NOTIFY pgrst, 'reload schema';
