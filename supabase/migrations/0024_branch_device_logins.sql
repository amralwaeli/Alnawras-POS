-- ============================================================
-- 0024_branch_device_logins.sql   (Device / terminal login — front half of 1D)
--
-- A device (cashier tablet / browser) signs in ONCE with a branch email+password
-- Supabase Auth account; staff then PIN in on top of that session. The device
-- stays bound to the branch account until an admin signs it out. This table maps
-- an Auth user -> the branch it operates. Mirrors `super_admins` (0019).
--
-- SAFE + DORMANT BY DESIGN: with ZERO rows here, device_login_required() returns
-- false and the app skips the whole email+password gate — behaviour is exactly
-- as today (PIN only). The gate turns on the moment the first row is inserted,
-- and turns back off if the rows are deleted. No lockout risk from deploying.
--
-- RLS stays OFF. This only establishes a real authenticated session now; the
-- database-level tenant isolation (RLS keyed on the branch) is the later 1D step.
-- ============================================================

CREATE TABLE IF NOT EXISTS branch_logins (
  auth_uid   TEXT PRIMARY KEY,      -- auth.users.id (UUID as text)
  branch_id  TEXT NOT NULL,         -- which branch this device account runs
  email      TEXT,
  label      TEXT,                  -- optional human note: "Front cashier", "Bar tablet"
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Is the device-login gate active at all? True once >=1 device account exists.
-- Callable by anon so the app can decide whether to show the email+password
-- screen BEFORE anyone signs in. Fail-safe: no rows -> false -> gate dormant.
CREATE OR REPLACE FUNCTION public.device_login_required()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM branch_logins);
$$;

-- Which branch does the CURRENTLY signed-in device account operate? Returns NULL
-- if the current session isn't a registered device login (e.g. no session, or a
-- super-admin session), which the app treats as "device not unlocked".
CREATE OR REPLACE FUNCTION public.current_device_branch()
RETURNS TEXT
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT branch_id FROM branch_logins WHERE auth_uid = auth.uid()::text;
$$;

REVOKE ALL ON FUNCTION public.device_login_required() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_device_branch() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.device_login_required() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_device_branch() TO anon, authenticated;

-- ─── PROVISIONING A BRANCH DEVICE LOGIN (manual, one time per branch) ───
-- 1. Supabase dashboard: Authentication -> Users -> Add user. Set the branch's
--    email + password, tick "Auto Confirm User".
-- 2. Copy that user's UID; get the branch id:  SELECT id, name FROM branches;
-- 3. Run (replace the placeholders):
--       INSERT INTO branch_logins (auth_uid, branch_id, email, label)
--       VALUES ('<auth-user-uid>', '<branch-id>', 'branch@example.com', 'Main');
-- The moment the first row exists, every device is asked for the email+password
-- once, then stays signed in until an admin signs the device out.
--
-- To DISABLE the gate again (revert to PIN-only, no lockout):  DELETE FROM branch_logins;

NOTIFY pgrst, 'reload schema';
