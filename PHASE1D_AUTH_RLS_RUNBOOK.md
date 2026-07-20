# Phase 1D — Real tenant isolation: Supabase Auth + RLS (runbook)

> This is the final stage of the multi-tenant work (Feature 1). It converts
> tenant separation from an **app-layer behavior** (1A–1C, already shipped) into
> a **database guarantee**. It also closes the production audit's single largest
> finding (CR-1: RLS off → the public anon key is a full read/write DB key).
>
> ⚠️ **This runbook is intentionally NOT an auto-applied migration.** Following
> the same stance `SECURITY.md` already takes: enabling RLS on the current
> anon-key architecture makes the app unable to read or write anything — a
> **total outage** — until staff login is moved to real Supabase Auth sessions
> **in lockstep**. Execute the steps below in order, on a **staging database
> first**, then production. Do not run the RLS section on its own.

---

## 0. Blocker (must clear before starting)

`REMEDIATION_PLAN.md` §2/§4: there is currently **no testable AlnawrasPOS
database reachable from the build environment** (the Supabase tooling here is
wired to an unrelated project). Phase 1D cannot be built-and-verified until one
of these exists:

- a **Supabase branch / staging project** cloned from prod schema, **or**
- direct, confirmed access to the real prod project (`uasnihapkcrgibnpqdyi` or
  whichever is confirmed production).

Everything below is ready to execute the moment that unblocks. All of it fits
the **Supabase free plan** (Auth up to 50k MAU, RLS, Auth Hooks, one Edge
Function are all free-tier).

---

## 1. Auth model decision — **(A) email + PIN Supabase Auth accounts** (recommended)

Each staff member gets a real Supabase Auth user. Login stays a PIN in the UX,
but underneath it establishes a real session whose JWT carries `branch_id` /
`org_id` / `role`, which RLS keys off.

- **Identity:** `auth.users.email` = the staff `users.email` already stored.
  `auth.users` password = the 4-digit PIN (or a per-user derived secret — see
  §1.1). One auth user per staff row, linked by `users.auth_uid` (new column).
- **Claims:** a **Custom Access Token Auth Hook** (SQL function, §3) injects
  `branch_id`, `org_id`, and `role` into every issued JWT by looking the signing
  user up in `users` + `branches`. No claims are trusted from the client.
- **Login flow:** client calls `supabase.auth.signInWithPassword({ email, pin })`.
  The existing `verify_staff_pin` RPC is retired for auth (kept only until
  cutover completes).

**Why (A) over (B) "Edge Function mints a session":** (A) is entirely
free-tier, needs no service-role token round-trip to the browser, and is
testable with the standard client SDK. (B) (an Edge Function that verifies the
PIN and mints a session via the admin API) is more moving parts and a fiddlier
session hand-back, with no real upside here.

### 1.1 PIN strength note (decide before go-live)

A 4-digit PIN as an auth password is weak on its own. Mitigations, pick per
appetite: (a) keep it — same posture as today, but now also gated by knowing
the email; (b) derive the auth password as `HMAC(server_pepper, staff_id ‖ pin)`
so the stored secret isn't just 4 digits; (c) raise PIN length to 6 at the same
time (touches `LoginView` + `EmployeeFormModal`, already flagged in the audit).
Recommendation: (b) + move to 6 digits when convenient.

---

## 2. Staff auth-account provisioning

Add the link column and back-fill an auth user per active staff member.

```sql
-- Link staff -> their Supabase Auth identity.
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_uid UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_uid ON users(auth_uid) WHERE auth_uid IS NOT NULL;
```

Provision auth users with the Admin API (service-role; run from a trusted
one-off script or an Edge Function, NEVER the browser). Pseudocode:

```ts
// for each active users row without auth_uid:
const { data, error } = await admin.auth.admin.createUser({
  email: staff.email,
  password: derivePassword(staff.id, staff.pin),   // see §1.1
  email_confirm: true,
  user_metadata: { staff_id: staff.id },
});
if (!error) await db.from('users').update({ auth_uid: data.user.id }).eq('id', staff.id);
```

New staff created after cutover must get an auth user at creation time
(`StaffController.addStaff` / `WorkforceController.createEmployee` call the same
provisioning Edge Function). PIN changes must reset the auth password too.

---

## 3. Custom Access Token Hook — inject tenant claims into the JWT

Enable in Dashboard → Authentication → Hooks → Custom Access Token, pointing at:

```sql
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_claims jsonb := event->'claims';
  v_uid    uuid  := (event->>'user_id')::uuid;
  v_role   text;
  v_branch text;
  v_org    text;
BEGIN
  SELECT u.role, u.branch_id, b.org_id
    INTO v_role, v_branch, v_org
    FROM users u
    LEFT JOIN branches b ON b.id = u.branch_id
    WHERE u.auth_uid = v_uid AND u.status = 'active'
    LIMIT 1;

  IF v_role IS NOT NULL THEN
    v_claims := jsonb_set(v_claims, '{app_role}',   to_jsonb(v_role));
    v_claims := jsonb_set(v_claims, '{branch_id}',  to_jsonb(v_branch));
    v_claims := jsonb_set(v_claims, '{org_id}',     to_jsonb(COALESCE(v_org, '')));
  END IF;

  RETURN jsonb_set(event, '{claims}', v_claims);
END; $$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
```

Helper accessors used by policies below:

```sql
CREATE OR REPLACE FUNCTION public.jwt_branch_id() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT auth.jwt() ->> 'branch_id' $$;
CREATE OR REPLACE FUNCTION public.jwt_app_role() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT auth.jwt() ->> 'app_role' $$;
```

---

## 4. Client cutover (must ship BEFORE step 5 runs on the same DB)

Moving `AuthContext.login` from `verify_staff_pin` → a real session. Keep it
**additive first** (dual-run), then flip:

1. **Additive (safe, no outage):** after the existing PIN verify succeeds, also
   call `supabase.auth.signInWithPassword({ email: user.email, password:
   derivePassword(user.id, pin) })`. If it fails, log and continue (app behaves
   exactly as today). Deploy. Now real sessions exist wherever provisioning
   (§2) is done, but nothing depends on them yet.
2. **Verify** in staging that a logged-in staff session's JWT contains
   `branch_id`/`app_role` (decode the token; check the hook fired).
3. **Flip:** make the session the source of truth — `currentUser` is derived
   from the session user + a `users` lookup; drop the `verify_staff_pin` primary
   path and the in-memory `AuthController.authenticate` fallback; stop selecting
   `pin` in `StaffController.getStaff` (closes audit CR-2). `logout()` calls
   `supabase.auth.signOut()`.
4. `RealtimeSyncEngine` and every controller keep working unchanged — they now
   run as the `authenticated` role instead of `anon`.

Customer QR / pickup pages stay **anon** (customers have no login). Their writes
must therefore go through `SECURITY DEFINER` RPCs after RLS is on (step 5.3) —
the direct `insert`/`update` calls in `OrderController.submitOrder`,
`SecureOrderingUI`, `GroupOrderService`, `PickupService`, and the `needs_waiter`
toggle need to move behind branch-scoped RPCs. (Feature 2's `pay_order_items`,
Feature 6's `get_product_sales`, and 0013's loyalty RPCs are already
`SECURITY DEFINER` and RLS-safe.)

---

## 5. Enable RLS + policies (run ONLY after step 4 is deployed & verified on this DB)

### 5.1 Enable RLS on every tenant table
```sql
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches            ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables              ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders              ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_payments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees           ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_summary     ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifier_groups     ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifier_options    ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_sessions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_orders   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pickup_tokens       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts              ENABLE ROW LEVEL SECURITY;
```

### 5.2 Branch-scoped policy for authenticated staff (repeat per table with a `branch_id`)
```sql
-- Template — apply to every table that has a branch_id column:
CREATE POLICY branch_rw ON <table> FOR ALL TO authenticated
  USING      (branch_id = public.jwt_branch_id())
  WITH CHECK (branch_id = public.jwt_branch_id());
```
`organizations` / `branches` get read-only-to-own-org policies; writes to those
stay super-admin-only (service role / the super-admin's own policy keyed on
`super_admins`). Child tables without their own `branch_id` (`modifier_options`,
`product_modifier_groups`, `guest_sessions`) scope via a parent `EXISTS` check.

### 5.3 Anon customer paths → SECURITY DEFINER RPCs
Anon keeps **no** direct table grants after this. Customer ordering works only
through branch-checked `SECURITY DEFINER` RPCs (created as part of step 4's
refactor): `join_table_group` (exists, 0008), a new `submit_customer_order`,
`set_table_needs_waiter`, plus read RPCs for the public menu. Storage buckets
stay as hardened in 0012 (public read; INSERT tightened to `authenticated` for
staff-only buckets).

---

## 6. Rollback

Per table, `ALTER TABLE <t> DISABLE ROW LEVEL SECURITY;` instantly restores the
pre-1D behavior (anon full access) — so if the cutover misbehaves, disabling RLS
is a one-statement revert while you diagnose. Keep the `verify_staff_pin` path in
the client until you've run a full shift on RLS without incident.

---

## 7. Go-live checklist (run on staging, then prod)

- [ ] §2 provisioning done; every active `users` row has `auth_uid`.
- [ ] §3 hook enabled; a fresh staff JWT decodes with `branch_id` + `app_role`.
- [ ] §4 step-1 build deployed; staff can log in and a real session is created.
- [ ] Two test branches exist. From branch A's session, a direct
      `supabase.from('orders').select()` returns **only** branch A rows.
- [ ] Attempt to read branch B's data from branch A's session → empty / denied
      (the actual isolation test — not just "the UI hides the button").
- [ ] Customer QR order, group order, pickup order all still succeed (via RPCs).
- [ ] Payment, split payment, loyalty earn/redeem, void item all still succeed.
- [ ] Super-admin panel still loads and can suspend/renew a branch.
- [ ] Rollback rehearsed once (disable RLS on one table, confirm, re-enable).

Only after all boxes pass on staging: schedule a low-traffic window and repeat
on production.
