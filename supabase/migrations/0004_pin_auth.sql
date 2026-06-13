-- ============================================================
-- 0004 PIN AUTH — hash PINs + verify them server-side
--
-- Closes the worst part of the auth hole: today the client downloads the
-- full users list (including plaintext `pin`) and compares PINs in the
-- browser. After this migration, login can verify a PIN through a
-- SECURITY DEFINER function that returns only safe columns — the client
-- never receives any PIN.
--
-- SAFE TO APPLY: this migration does NOT enable RLS and does NOT drop the
-- `pin` column, so the existing app keeps working. A BEFORE trigger keeps
-- `pin_hash` in sync with any code path that still writes plaintext `pin`,
-- so newly created staff authenticate correctly.
--
-- Full lock-down (drop plaintext `pin`, enable RLS) is 0005 — read SECURITY.md
-- first; it requires an auth-model decision and will break the anon-key app
-- as currently architected.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. Hashed-PIN column + backfill from existing plaintext PINs (bcrypt).
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash TEXT;

UPDATE users
SET pin_hash = extensions.crypt(pin, extensions.gen_salt('bf'))
WHERE pin_hash IS NULL AND pin IS NOT NULL;

-- 2. Keep pin_hash in sync for any writer that still sets plaintext `pin`
--    (StaffController.addStaff / WorkforceController.createEmployee / updateStaff).
CREATE OR REPLACE FUNCTION public.users_sync_pin_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.pin IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.pin IS DISTINCT FROM OLD.pin) THEN
    NEW.pin_hash := extensions.crypt(NEW.pin, extensions.gen_salt('bf'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_sync_pin_hash ON users;
CREATE TRIGGER trg_users_sync_pin_hash
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION public.users_sync_pin_hash();

-- 3. Verify a PIN server-side. Returns the matching active user's SAFE
--    columns only — never a PIN. SECURITY DEFINER so it works regardless of
--    RLS, and is the ONLY way the client should resolve a PIN.
CREATE OR REPLACE FUNCTION public.verify_staff_pin(p_pin TEXT)
RETURNS TABLE (
  id TEXT, name TEXT, employment_number TEXT, role TEXT, email TEXT,
  status TEXT, branch_id TEXT, created_at TIMESTAMPTZ,
  hire_date DATE, hourly_rate NUMERIC, position TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT u.id, u.name, u.employment_number, u.role, u.email, u.status,
         u.branch_id, u.created_at, u.hire_date, u.hourly_rate, u.position
  FROM users u
  WHERE u.status = 'active'
    AND u.pin_hash IS NOT NULL
    AND u.pin_hash = extensions.crypt(p_pin, u.pin_hash)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.verify_staff_pin(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_staff_pin(TEXT) TO anon, authenticated;

-- 4. Set a PIN without ever exposing it (for the eventual hardening in 0005,
--    where the `pin` column is dropped and writers call this instead).
CREATE OR REPLACE FUNCTION public.set_staff_pin(p_user_id TEXT, p_pin TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  UPDATE users SET pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf'))
  WHERE id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.set_staff_pin(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_staff_pin(TEXT, TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
