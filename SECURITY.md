# Security posture & hardening runbook

This file tracks the authentication/authorization model and the staged plan to
close the known holes. Read it before applying any security migration.

## The core problem

The app talks to Supabase directly from the browser using the **public `anon`
key** and does **not** use Supabase Auth. Staff "log in" with a 4-digit PIN
checked against the `users` table at the application level — there is no
Supabase session, so **every database request is the `anon` role**.

Consequences:
- Until 0004, the client downloaded the entire `users` list **including
  plaintext `pin`**, and compared PINs in the browser. Anyone who opened the
  app (or replayed the anon key) could read every PIN.
- Because there is no per-user identity in the database, **Row-Level Security
  cannot scope data by user/branch/role**. RLS can only tell `anon` from
  `authenticated` from `service_role`. With everything on `anon`, any policy
  that lets the app read also lets an attacker with the same (public) key read.

So RLS *alone* cannot secure this app as architected. Real lock-down requires
one of:
- **(A) Supabase Auth** — each staff member becomes an auth user; the JWT
  carries `branch_id`/`role` claims; RLS policies key off `auth.uid()` /
  `auth.jwt()`. This is the proper fix.
- **(B) Backend proxy** — all DB access goes through trusted server code
  (Edge Functions with the service role); the anon key is granted nothing.

Both are rearchitectures, not a migration.

## What has been done

### Migration `0004_pin_auth.sql` — SAFE TO APPLY
- Adds `users.pin_hash`, backfills bcrypt hashes from existing plaintext PINs.
- Trigger `users_sync_pin_hash` keeps `pin_hash` current for any code path that
  still writes plaintext `pin` (so new staff authenticate correctly).
- `verify_staff_pin(p_pin)` — `SECURITY DEFINER`; returns the matching active
  user's **safe columns only** (never a PIN). The client uses this to log in.
- `set_staff_pin(user_id, pin)` — `SECURITY DEFINER` setter for the eventual
  state where the plaintext column is gone.

Applying 0004 does **not** enable RLS and does **not** drop `pin`, so the running
app is unaffected.

### Client
- `AuthContext.login` now calls `verify_staff_pin` first; **no PIN list is
  needed for login**. It falls back to the legacy in-memory compare **only if
  the RPC is missing** (i.e. 0004 not applied yet), so deploying this build
  before applying 0004 does not break login.
- `ROLE_PERMISSIONS` is now the single authorization source; the ad-hoc
  `allowedRoles` overrides in `routes.tsx` were removed (manager/supervisor
  `canManageStaff` encoded in the matrix instead).

## Remaining hardening (do in order)

1. **Apply `0004_pin_auth.sql`** in the Supabase SQL Editor.
2. **Remove the login fallback** in `AuthContext.login` and stop selecting
   `pin` in `StaffController.getStaff` (and drop `pin` from `mapStaff`), so the
   client never receives a PIN by any path.
3. **Route PIN writes through `set_staff_pin`** in `StaffController.addStaff` /
   `updateStaff` and `WorkforceController.createEmployee`, then **drop the
   plaintext column**: `ALTER TABLE users DROP COLUMN pin;` and remove the
   `users_sync_pin_hash` trigger. After this, no plaintext PIN exists anywhere.
4. **Choose an auth model (A or B above)** and only then enable RLS. The
   lock-down SQL below assumes you have done so — it is intentionally **not**
   shipped as an auto-runnable migration because applying it on the current
   anon-only architecture will make the app unable to read or write anything.

### Lock-down SQL (apply ONLY after step 4)

```sql
-- Deny anon direct table access; force everything through authenticated
-- sessions / SECURITY DEFINER RPCs. Enable per table, then add policies that
-- key off auth.uid()/auth.jwt() once Supabase Auth is in place.
ALTER TABLE users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE products     ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables       ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees    ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_orders    ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_sessions     ENABLE ROW LEVEL SECURITY;
-- Example policy (after Supabase Auth, with branch_id in the JWT):
--   CREATE POLICY branch_read ON orders FOR SELECT TO authenticated
--   USING (branch_id = (auth.jwt() ->> 'branch_id'));
```
