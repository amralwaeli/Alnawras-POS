-- ============================================================
-- 0030_staff_pin.sql   (Batch 2b — audit AUD-03)
--
-- Today every visitor downloads every staff member of every tenant, with the
-- plaintext 4-digit PIN; PIN login has no attempt limit and no branch scope, so
-- two people with the same PIN (likely across tenants) log in as each other.
--
--   1. No plaintext PINs stored. The existing hashing trigger now also blanks
--      `users.pin` after hashing it, and refuses a PIN that someone else in the
--      same branch already uses. Existing plaintext PINs are blanked here.
--   2. verify_staff_pin() only matches staff of the branch the DEVICE is signed
--      in to (current_device_branch(), 0024), and is callable by signed-in
--      devices only. Wrong tries: 5 per minute per terminal (the app passes its
--      device id) and 30 per minute for the whole branch login (which all the
--      branch's terminals share), so one terminal can't lock out the others and
--      a script can't rotate ids to brute-force. A correct PIN does NOT reset the
--      count (that would let guesses be interleaved with a known PIN).
--   3. set_staff_pin() only for staff of the caller's own branch.
--   4. The `pin` and `pin_hash` columns can no longer be read through the API,
--      and `pin_hash` can't be written directly either (only the trigger sets
--      it); signed-in devices may read the other staff columns. Anonymous
--      visitors cannot read the staff table at all.
--
-- REQUIRES: every device that uses the PIN pad is signed in with its branch
-- email + password (the installed app already asks once a branch login exists).
-- DATA: blanks plaintext PINs (pin_hash keeps working). Production data was
-- confirmed disposable on 2026-11-17. Apply BEFORE the matching client.
-- ============================================================

ALTER TABLE users ALTER COLUMN pin DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.users_sync_pin_hash()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.pin IS NOT NULL AND NEW.pin <> '' THEN
    IF NEW.pin !~ '^\d{4}$' THEN RAISE EXCEPTION 'PIN must be exactly 4 digits'; END IF;
    -- One PIN change per branch at a time, so two concurrent saves can't both pass the check.
    PERFORM pg_advisory_xact_lock(hashtext('pin:' || NEW.branch_id));
    IF EXISTS (
      SELECT 1 FROM users u
      WHERE u.branch_id = NEW.branch_id AND u.id <> NEW.id   -- inactive staff too: they can be reactivated
        AND u.pin_hash IS NOT NULL AND u.pin_hash = extensions.crypt(NEW.pin, u.pin_hash)
    ) THEN
      RAISE EXCEPTION 'That PIN is already used by someone in this branch. Choose another.'
        USING ERRCODE = 'unique_violation';
    END IF;
    NEW.pin_hash := extensions.crypt(NEW.pin, extensions.gen_salt('bf'));
  END IF;
  NEW.pin := NULL;   -- never keep the plaintext
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_sync_pin_hash ON users;
CREATE TRIGGER trg_users_sync_pin_hash
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION public.users_sync_pin_hash();

UPDATE users SET pin = NULL WHERE pin IS NOT NULL AND pin_hash IS NOT NULL;

-- ── Attempt throttle ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pin_attempts (
  device_uid   TEXT NOT NULL,   -- branch login uid, or uid:terminal-id
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pin_attempts_device ON pin_attempts(device_uid, attempted_at);
ALTER TABLE pin_attempts ENABLE ROW LEVEL SECURITY;            -- no policies: functions only
REVOKE ALL ON pin_attempts FROM anon, authenticated;

-- Return type is unchanged from 0004, so the client keeps working.
DROP FUNCTION IF EXISTS public.verify_staff_pin(TEXT);
DROP FUNCTION IF EXISTS public.verify_staff_pin(TEXT, TEXT);
CREATE FUNCTION public.verify_staff_pin(p_pin TEXT, p_device TEXT DEFAULT NULL)
RETURNS TABLE (
  id TEXT, name TEXT, employment_number TEXT, role TEXT, email TEXT,
  status TEXT, branch_id TEXT, created_at TIMESTAMPTZ,
  hire_date DATE, hourly_rate NUMERIC, job_role TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_login  TEXT := auth.uid()::text;
  v_device TEXT;
  v_branch TEXT := public.current_device_branch();
BEGIN
  IF v_login IS NULL OR v_branch IS NULL THEN
    RAISE EXCEPTION 'This device is not signed in to a branch. Ask an admin to sign it in.';
  END IF;
  v_device := v_login || ':' || left(COALESCE(p_device, '?'), 64);
  PERFORM pg_advisory_xact_lock(hashtext('pinlogin:' || v_login));   -- count + insert as one step

  DELETE FROM pin_attempts WHERE attempted_at < NOW() - interval '1 hour';
  IF (SELECT COUNT(*) FROM pin_attempts WHERE device_uid = v_device
        AND attempted_at > NOW() - interval '1 minute') >= 5 THEN
    RAISE EXCEPTION 'Too many wrong PINs on this terminal. Please wait a minute and try again.';
  END IF;
  IF (SELECT COUNT(*) FROM pin_attempts WHERE device_uid LIKE v_login || ':%'
        AND attempted_at > NOW() - interval '1 minute') >= 30 THEN
    RAISE EXCEPTION 'Too many wrong PINs at this branch. Please wait a minute and try again.';
  END IF;

  RETURN QUERY
    SELECT u.id, u.name, u.employment_number, u.role, u.email, u.status,
           u.branch_id, u.created_at, u.hire_date, u.hourly_rate::numeric, u.job_role
    FROM users u
    WHERE u.branch_id = v_branch AND u.status = 'active'
      AND u.pin_hash IS NOT NULL AND u.pin_hash = extensions.crypt(p_pin, u.pin_hash)
    LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO pin_attempts(device_uid) VALUES (v_device);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.verify_staff_pin(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_staff_pin(TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_staff_pin(p_user_id TEXT, p_pin TEXT)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  -- The trigger validates, de-duplicates and hashes.
  UPDATE users SET pin = p_pin WHERE id = p_user_id AND branch_id = public.current_device_branch();
$$;
REVOKE ALL ON FUNCTION public.set_staff_pin(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_staff_pin(TEXT, TEXT) TO authenticated;

-- ── Hide pin / pin_hash from the API ─────────────────────────
-- Column grants: reads (and RETURNING) may only name these columns.
REVOKE SELECT, INSERT, UPDATE ON users FROM anon, authenticated;
GRANT SELECT (id, name, employment_number, role, email, status, branch_id,
              hire_date, hourly_rate, job_role, created_at) ON users TO authenticated;
-- Writes may set `pin` (hashed + blanked by the trigger) but never `pin_hash` itself.
GRANT INSERT (id, name, employment_number, role, pin, email, status, branch_id,
              hire_date, hourly_rate, job_role, created_at) ON users TO authenticated;
GRANT UPDATE (name, employment_number, role, pin, email, status, branch_id,
              hire_date, hourly_rate, job_role) ON users TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- VERIFY (read-only)
--   SELECT count(*) FROM users WHERE pin IS NOT NULL;        -- expect 0
--   SELECT has_column_privilege('authenticated', 'users', 'pin_hash', 'SELECT');  -- expect false
--   SELECT has_column_privilege('authenticated', 'users', 'pin_hash', 'UPDATE');  -- expect false
--
-- ROLLBACK (manual — plaintext PINs blanked by this file cannot come back;
-- staff keep logging in through pin_hash, and new PINs can be set again):
--   ⚠ Do NOT re-grant SELECT on users: pin_hash of a 4-digit PIN cracks in seconds.
--   Re-run 0004_pin_auth.sql to restore the unscoped verify_staff_pin(TEXT) (and its anon grant), then:
--   DROP FUNCTION IF EXISTS public.verify_staff_pin(TEXT, TEXT);
--   GRANT INSERT, UPDATE ON users TO anon, authenticated;
--   DROP TABLE IF EXISTS pin_attempts;
--   NOTIFY pgrst, 'reload schema';
-- ============================================================
