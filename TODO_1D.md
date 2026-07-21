# TODO — 1D (Auth + RLS): do this BEFORE the 2nd tenant

**What it is:** real database-level tenant isolation — staff log in with real
Supabase Auth sessions, and Row-Level Security walls each branch's data off so
one tenant can never read another's orders/customers/staff PINs.

**When:** only needed right before onboarding a **2nd paying tenant** into the
shared database. With **1 tenant, do nothing** — there's no one to isolate from.
That's also when you'd go **Supabase Pro**, whose **Branching** gives you a free
cloud test database (no PC needed).

**Where the work already is:** git branch **`feature/1d-auth-rls`** — mostly
built, NOT merged, NOT deployed. Full detail: `PHASE1D_STATUS.md` and
`PHASE1D_AUTH_RLS_RUNBOOK.md` (on that branch).

---

## ⛔ Do NOT do until ready + tested
- Do **not** apply migrations `0024`, `0025`, `0026` to production yet.
- `0026` turns RLS ON — if applied before the steps below, it **blacks out the
  whole app**. It is always the **LAST** step, after everything is tested.

## ✅ Steps to finish it (when tenant #2 is near)
1. [ ] Get a **test database** — Supabase Pro branch (recommended) or a throwaway
       free project. (Not your PC.)
2. [ ] Finish the client rewires still open (see `PHASE1D_STATUS.md`):
       - [ ] Customer QR / group / pickup views → the new RPCs.
       - [ ] Super-admin panel → a **service-role Edge Function**.
       - [ ] C3: stop selecting `pin` in `getStaff`; drop the login fallback.
3. [ ] Provision staff auth accounts — run the `provision-staff-auth` function.
4. [ ] Enable the **Custom Access Token hook** (Supabase dashboard → Auth → Hooks).
5. [ ] On the test DB, apply `0024` → `0025` → deploy the client → **then** `0026`.
6. [ ] Run the isolation checklist: log in as branch A, confirm you **cannot**
       read branch B's data; confirm ordering / payment / split / loyalty / pickup
       all still work.
7. [ ] Fix whatever the test surfaces (blind-written SQL always needs a pass).
8. [ ] Only when green: merge branch → `main`, then repeat on **prod** during a
       quiet window, in the same order.

## 🔙 Rollback (if anything misbehaves on prod)
`ALTER TABLE <table> DISABLE ROW LEVEL SECURITY;` instantly restores access.
Keep the old PIN-login path until a full shift has run on RLS without incident.
