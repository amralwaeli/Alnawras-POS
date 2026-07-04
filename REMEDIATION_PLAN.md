# AlnawrasPOS — Production Remediation Plan & Handoff

> Living handoff doc. If a work session ends mid-task, resume from here. It records
> what is DONE, what is IN PROGRESS, and the exact next actions for everything
> remaining. Severity IDs (CR-#, HI-#, MED-#) refer to the production audit.

_Last updated: 2026-07 (Increment 1A complete; Increment 1B code complete, migration NOT yet applied)._

---

## 0. How to resume quickly

- **Build/verify (no side effects):** `npx vite build --outDir .verify_build --emptyOutDir && rm -rf .verify_build` (exit 0 = imports resolve, no syntax errors). Note: there is no typecheck/test in CI yet (see MED "CI").
- **Nothing is committed yet.** All 1A + 1B changes live in the working tree. Review with `git status --short` and `git diff`.
- **DB migrations are applied MANUALLY** to the production Supabase project via the SQL editor (CI does not run them). See the ⚠️ project blocker below.
- Reusable utilities already created — **use these, don't re-implement**:
  - `src/lib/csv.ts` — `downloadCsv`, `escapeCsvCell` (CSV + formula-injection safe).
  - `src/lib/upload.ts` — `randomHex`, `extForType`, `validateUpload`, `IMAGE_TYPES`, `RECEIPT_TYPES`, `MB`.
  - `src/lib/image.ts` — `compressImage`, `blobToDataUrl` (pre-existing).

---

## 1. Locked decisions (from the user)

1. **Sequencing:** Containment first, then the auth/RLS rearchitecture.
2. **Phase 1 auth model:** **Supabase Auth + RLS** (each staff = an auth user; JWT carries `branch_id`/`role`; RLS policies + `SECURITY DEFINER` RPCs). No separate backend server.
3. **DB migration application:** directly to production — BUT see the blocker: the correct production project must be targeted.

---

## 2. ⚠️ BLOCKER: Supabase project mismatch (resolve before any DB change)

- App config ([.env](.env)) and every migration header target **`uasnihapkcrgibnpqdyi`** (`https://uasnihapkcrgibnpqdyi.supabase.co`).
- The Supabase MCP tooling in this environment is connected to a **different** project **`eyaacfoiwfkssailoraw`** ("Alsakkaf-dev's Project"), which is a **stale/partial dev DB**: 0 storage buckets, 0 storage policies, only 11 public tables (prod has ~23 through migration 0011). **Do not apply migrations there.**
- **ACTION NEEDED FROM USER:** confirm which project is production, and either (a) apply migrations yourself in the SQL editor of the correct project, or (b) connect the MCP/CLI to the correct project so migrations can be applied programmatically. Also confirm which `VITE_SUPABASE_URL` the GitHub Actions deploy secret uses (that is what the live site actually talks to).

---

## 3. Increment 1A — Containment & Hygiene ✅ CODE COMPLETE (uncommitted)

All zero-/low-regression. Build verified. **Not committed. Not deployed.**

**Files changed:**
- `print-proxy.js` — hardened: binds `127.0.0.1` (env `PRINT_PROXY_HOST`), printer IP+port allowlist (`PRINTER_IPS`/`PRINTER_PORTS`, default LAN-private + 9100), CORS allowlist, optional `PRINT_PROXY_TOKEN`, hex+size validation. Closes the SSRF/arbitrary-TCP relay (HI-18).
- `supabase/functions/send-pickup-ready/index.ts` — now takes only `{ orderId }`, resolves recipient server-side via service role, HTML-escapes, origin-restricted CORS, in-memory rate limit. Closes the open email relay (HI-17).
- `src/app/controllers/PickupController.ts` — calls the function with `{ orderId }` only.
- `src/app/modules/auth/LoginView.tsx` — removed the "Quick Access" demo-PIN buttons (were live, not just in the dead file).
- `src/app/controllers/AnalyticsController.ts` — **DELETED** (dead code: was a duplicate LoginView with demo PINs).
- `src/lib/csv.ts` — **NEW** shared CSV utility (RFC 4180 + formula-injection defense).
- CSV exports refactored onto it (HI-37): `AccountingView.tsx`, `workforce/payroll/PayrollView.tsx`, `hr/HRPanelView.tsx`, `workforce/attendance/WorkforceAttendanceView.tsx`, `hr/AttendanceView.tsx`.
- `src/app/services/PrintService.ts` — strips ASCII control chars from product names/notes/modifiers before ESC/POS printing.

**Deploy steps (when approved):** redeploy frontend (push to `main` → Pages) **together with** `supabase functions deploy send-pickup-ready`; restart `node print-proxy.js` on the cashier device (optionally set `PRINTER_IPS`).

**⚠️ USER ACTION (data/ops, cannot be done in code):** the demo PINs `1234` (Admin) / `2345` (Cashier) were wired to the login and almost certainly map to **real active accounts** — **rotate these PINs** and audit for other well-known ones.

**Manual tests:** print a ticket (same host → works; bogus public IP → rejected); pickup "Ready" email arrives and cannot be sent to an arbitrary address; login works, demo buttons gone; export each report and open in Excel (a name like `=1+1` is inert text; Arabic renders; numbers stay numeric).

---

## 4. Increment 1B — Storage hardening 🟡 CODE COMPLETE, MIGRATION NOT APPLIED

Build verified. **Not committed. Migration NOT applied (blocked by §2).**

**Files changed (code):**
- `supabase/migrations/0012_storage_hardening.sql` — **NEW, NOT YET APPLIED.** Sets bucket `allowed_mime_types` + `file_size_limit` (server-enforced), drops anon UPDATE/DELETE on `product-images`, drops anon UPDATE/DELETE on `merchant-qr` (locks the payment-QR overwrite fraud, CR-7 / HI-19).
- `src/lib/upload.ts` — **NEW** (`randomHex`, `extForType`, `validateUpload`, type/size consts).
- `src/app/services/ProductImageService.ts` — crypto-random key, create-only (`upsert:false`).
- `src/app/services/PickupService.ts` — `uploadReceipt` (unguessable key, MIME-derived ext, create-only); `uploadMerchantQr` now returns `{url} | {error, alreadyExists}` and is create-only.
- `src/app/modules/pickup/PickupBoardView.tsx` — QR upload: client validation + handles new result shape + "already set → replace via dashboard" message.
- `src/app/modules/pickup/PickupOrderingView.tsx` — receipt upload: client validation (`RECEIPT_TYPES`, 15 MB).

**➡️ NEXT ACTION — apply `0012_storage_hardening.sql` to the PRODUCTION project** (`uasnihapkcrgibnpqdyi`, or whichever is confirmed prod), via SQL editor or CLI. Recommend a snapshot first.

**Verify after applying (read-only):**
```sql
SELECT id, file_size_limit, allowed_mime_types FROM storage.buckets
  WHERE id IN ('product-images','merchant-qr','pickup-receipts');
SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' ORDER BY 1;
-- expect: product_images_update/delete and merchant_qr_update/delete are GONE;
--         *_insert and *_read remain.
```

**Manual tests:** upload a product image (works, new random key); upload a customer receipt (works); try uploading a `.txt`/`.svg` or >limit file (rejected client + server); confirm the customer pickup page still shows the payment QR (read path unchanged); admin "Upload Payment QR" on a branch that already has one now shows the "replace via dashboard" message (expected).

**KNOWN RESIDUAL (honest):** pre-auth, write authorization cannot be fully enforced (app writes as `anon` = attacker's role). 1B blocks non-image/oversized uploads and overwrite/delete of existing objects; full staff-only write authorization lands in **Phase 1**.

---

## 5. Phase 1 — Auth + RLS + server-side RPCs (THE BIG ONE) — NOT STARTED

This single rearchitecture is the root-cause fix for the majority of Critical/High findings. Do it as its own multi-increment effort, moving client and DB **in lockstep** (enabling RLS without the client migrated = total outage — see [SECURITY.md](SECURITY.md)).

**Target design:** Supabase Auth (staff = auth users), custom JWT claims `branch_id` + `role`, RLS policies keyed on `auth.jwt()`, and `SECURITY DEFINER` RPCs for every privileged/monetary mutation.

**Suggested increment order inside Phase 1:**
1. **Auth foundation:** create Supabase Auth users for staff; map PIN login → a session (e.g., PIN → Edge Function that verifies via `verify_staff_pin` and mints a session, or migrate to email+PIN). Add `branch_id`/`role` as custom claims (Auth Hook). Stop selecting `pin`/`pin_hash` to the client; drop `mapStaff.pin`; remove the legacy in-memory fallback in `AuthContext.login`. (**CR-2**)
2. **Order + payment RPCs** (`SECURITY DEFINER`, one transaction each): server re-prices lines from `products`, computes tax/discount, decrements stock atomically (`UPDATE ... WHERE stock >= qty`), assigns bill numbers via a Postgres sequence, sets `status='open'→'completed'` with compare-and-set + idempotency key. Fixes **CR-5, CR-9, CR-10, HI-1, HI-2, HI-3(decision), HI-4**, and the "stock never decremented" gap. Route `OrderController.submitOrder` + `PaymentModal.handlePayment` through these.
3. **Loyalty RPCs:** atomic `increment_loyalty_points` (create it — referenced but MISSING) + guarded `redeem`/`adjust` (`... WHERE points_balance >= p RETURNING`), idempotent per order; reverse on refund/void. Fixes **CR-8, HI-4(loyalty), HI-34, HI-35**.
4. **Pickup/QR/status RPCs:** move `approvePayment`/`setPickupStatus`/`markPicked`/`needs_waiter`/product availability behind role-checked RPCs. Fixes **CR-6, HI-38, MED (needs_waiter DoS)**.
5. **Enable RLS on all tables** + storage buckets (tighten INSERT to `authenticated`), keyed to `branch_id`/`role`. The lock-down SQL skeleton is in [SECURITY.md](SECURITY.md#L70). Fixes **CR-1, CR-7(full), CR-11, HI-6, HI-19(full), HI-21**.
6. **Remove token-less legacy routes** `/table/:id` and `/order/table-N` (reprint QR codes to the token URL). **HI-21**.

---

## 6. Remaining issue ledger (post-1B)

Status: ☐ TODO · ◑ code done/pending apply · ✅ done. Full detail per item is in the audit; this is the actionable index.

### Critical (all remaining fold into Phase 1 above)
- ☐ CR-1 RLS+public key → Phase 1 §5.5
- ☐ CR-2 plaintext PIN to client → Phase 1 §5.1
- ☐ CR-3 biometric XOR key in bundle → **Biometrics rearch** (below)
- ☐ CR-4 simulated scanner / client-side match → **Biometrics rearch**
- ☐ CR-5 client prices → Phase 1 §5.2
- ☐ CR-6 self-approve payment → Phase 1 §5.4
- ◑ CR-7 merchant-QR fraud → 1B (apply 0012) + full in Phase 1 §5.5
- ☐ CR-8 loyalty non-atomic → Phase 1 §5.3
- ☐ CR-9 offline orders never sync → Phase 1 §5.2 (also can fix queue payload standalone: include ALL NOT-NULL cols + retry cap + dead-letter in `OfflineSyncEngine`)
- ☐ CR-10 non-idempotent payment → Phase 1 §5.2
- ☐ CR-11 one-click full-DB backup → **quick pre-auth win:** disable/scope `AdminDashboardView.handleBackup` (branch filter + strip credential cols) or gate server-side.

### Biometrics rearchitecture (CR-3, CR-4, MED M4/M5, LOW L4)
- ☐ Move enrollment + matching server-side (Edge Function / native SDK); server-held key (not `HRController.ENCRYPTION_KEY`); store only server-encrypted templates; RLS-lock `employee_fingerprints`; remove `FingerprintScanner.simulateCapture` fallback from prod; replace `computeSimilarity` with a real matcher. Until done, consider disabling fingerprint attendance.

### High — client-only fixes (can be done PRE-auth, low regression) — good "Increment 1C"
- ☐ HI-33 conditional Hooks after early return → crash. Move hooks above `if (!currentUser) return null` in `AccountingView.tsx:27/30` and `DashboardView.tsx:94/127`.
- ☐ HI-26 ghost tables: add DELETE branch in `RealtimeSyncEngine.tsx:62-85` tables handler (mirror orders handler).
- ☐ HI-25 product add/delete not reflected: broaden products realtime to `*` (INSERT/DELETE) in `RealtimeSyncEngine.tsx:87-90` and/or optimistic updates in `CatalogContext`.
- ☐ HI-22 payment channel leak: reuse one ref-held channel / remove on unmount in `PaymentModal.tsx:510-515`.
- ☐ HI-27 SW reload wipes in-progress bill: replace unconditional `location.reload()` in `main.tsx:30-39` with a "refresh available" prompt / idle-gate.
- ☐ HI-29 blank POS on load error: try/catch + retry UI in `RealtimeSyncEngine.tsx:29-52`; wire real load/error state (repurpose the dead `POSContext` `loading`).
- ☐ HI-31 no route error boundary: add `errorElement` per route in `routes.tsx`; handle lazy-import rejection.
- ☐ HI-23 realtime reconnect loses events: resync on `SUBSCRIBED`/`online`/`visibilitychange` in `RealtimeSyncEngine.tsx:147`.
- ☐ HI-24 `usePOS` re-render amplification: memoize provider values; migrate hot views to focused hooks. (Larger; perf.)
- ☐ HI-28/HI-30 payment-channel churn / out-of-order realtime writes.

### High — need DB/auth (fold into Phase 1)
- ☐ HI-1 bill-number race, HI-2 total lost-update, HI-4 no transactions, HI-5 Date.now() PKs, HI-6 server authz, HI-7 HR-panel-creates-admin (also quick client fix: remove `admin` from `HRPanelView` role list + guard `HRController.add/updateEmployee`), HI-14 dup PIN/brute-force, HI-36 xlsx import (pin from npm + Web Worker + reject `__proto__` headers).

### High — payroll/attendance correctness (own increment; mostly `HRController.ts` + `WorkforceController.ts`)
- ☐ HI-8 absences never deducted; HI-9 overtime blocked; HI-10 month-boundary drops last day (timezone); HI-11 `log_date` UTC vs local; HI-12 recompute un-approves; HI-13 employment-number collision; HI-15 duplicate check-in jams day; HI-16 kiosk leaks salaries. **Pick one canonical business timezone; base payroll denominators on real scheduled days/hours; add unique `(employee_id, log_date)` + `employees.employee_id` constraints.**

### Medium / Low
- ☐ See audit for the full ~30 Medium + ~30 Low. Notables to sweep opportunistically while touching those files: tax decision (HI-3), `ROLE_PERMISSIONS` inconsistencies (drive PaymentModal from `canProcessPayments`), analytics divide-by-zero guard (`businessLogic.ts:180`), loyalty/bill settings → server (not localStorage), modifier save non-atomic, table-number uniqueness, CSP/security headers, Capacitor cleartext/remote-URL, CI typecheck+tests+`tsconfig.json`, no-op Sentry without DSN, `daily_backup.js` encryption/redaction, ShiftManagementView unescaped `user_name` print.

---

## 7. Working conventions (keep quality bar)

- Never trust the client; enforce server-side (Phase 1). No secrets in the frontend bundle.
- One responsibility per function; reuse the shared `lib/` utilities; no duplicated logic.
- Every DB mutation that spans rows/needs consistency → a `SECURITY DEFINER` RPC in one transaction; make it idempotent; guard with compare-and-set.
- After each increment: build-verify, self-review for security/perf/concurrency/UI regressions, list manual tests, then STOP for approval before the next increment.
- Money in integer cents where practical; round once at the boundary.
- Migrations idempotent + reversible; applied to the CONFIRMED production project only.
