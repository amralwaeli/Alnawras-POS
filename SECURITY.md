# Security model

How AlnawrasPOS keeps each restaurant's data separate, and what to keep in mind
when changing the database. Current as of November 2026 (migrations up to 0051).

## Who is who

| Caller | How it signs in | What it can do |
|---|---|---|
| **Branch device** (website admin, cashier PC, tablets) | Supabase Auth with the branch's email + password — once per tablet in the app; on the website only for the open tab (closing it signs out) | Read and change rows of **its own branch only** (`branch_id = current_device_branch()`) |
| **Staff member** | 4-digit PIN on top of a signed-in device (`verify_staff_pin`) | Roles are enforced in the app and in the server functions; all staff on a device share the branch session |
| **Customer** | No login — a table QR, guest-session or pickup token | Only the token-checked functions in `0029` (`guest_*`, `pickup_*`) |
| **Anonymous visitor** | — | Read active menus and the branch list; nothing else |
| **Super-admin** | Supabase Auth, listed in `super_admins` | Manage organisations and branches (`0028`) and invite tenants (Edge Functions) |

## Rules enforced by the database

- **Row-Level Security is on for every table** (`0032`). A table without a policy is closed to the API.
- Rows that point at another row (a bill line → its bill, a bill → its table, …) must point at a row of the **same branch**.
- Payment and loyalty history can't be edited from a device; the audit log is append-only; a paid bill and its lines can't be changed or deleted.
- Prices, totals, tax, discounts, loyalty and bill numbers are computed by server functions (`submit_order_items`, `pay_order`, `pay_order_items`, `void_order_item`), which also check the caller's branch (`0031`, `0033`).
- PINs are stored only as bcrypt hashes, can't be read or written through the API, are unique per branch, and wrong tries are limited per terminal and per branch (`0030`).
- Saved invoices and quotations (`documents`, `0035`) are readable by the branch's own devices and written only through `save_document`, which numbers them per branch.
- Customer debts (`0036`): accounts are per branch; the ledger (`debt_entries`) is read-only to devices and written only by `pay_order` (method `account`, credit limit checked), `record_debt_payment` and `adjust_debt`.
- The Android app's printer bridge (`LanPrinterPlugin`) only connects to private LAN IP addresses.
- Storage: menu photos and the payment QR can only be uploaded by a branch device into its own name; the receipts bucket can't be listed.
- New sign-ups are switched off in Supabase Auth.
- The website sends a Content-Security-Policy (in `index.html`) and refuses to run inside another site's frame.

## When you change the database

1. Every new table needs RLS and a branch policy **in the same migration**.
2. Every new function: `REVOKE ALL … FROM PUBLIC, anon` and grant only what it needs — Supabase grants `EXECUTE` to `anon` by default. `SECURITY DEFINER` functions must set `search_path` and check the caller's branch.
3. Never put the service-role key in the app or in a `VITE_` variable.
4. `pnpm test` runs every migration on an in-process Postgres (`supabase/migrations/testdb.ts`); add a test for each rule you add.
5. Apply migrations in order; the cutover order and rollbacks are in `supabase/migrations/README.md`.

## Reporting a problem

Contact the repository owner privately; please don't open a public issue for a security problem.
