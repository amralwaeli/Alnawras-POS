# Database migrations — authoritative history

This folder is the **single source of truth** for the Alnawras POS schema. It
replaces the previously scattered and contradictory sources (`database_schema.sql`,
`database_setup.sql`, `database_migrations/`, the old `supabase/migrations/001-004`,
and the `check_db.js` / `setup_db.js` scripts), all of which had drifted from
production and have been removed.

## Files (apply in order)

| File | Type | Apply to prod? |
|------|------|----------------|
| `0001_baseline.sql` | DDL — documents the live schema as it exists today | No-op on prod (all `IF NOT EXISTS`); use to rebuild a fresh DB |
| `0002_workforce_reconcile.sql` | DDL — adds the 7 missing `employees` columns, creates `leave_requests`, extends the `users` role CHECK | **Yes — required.** Until applied, employee-create and leave features are broken in prod |
| `0003_backfill_employees_from_users.sql` | DATA — seeds `employees` from existing `users` | Optional. Writes rows; review first |
| `0004_pin_auth.sql` | DDL — hashes PINs + adds `verify_staff_pin`/`set_staff_pin` RPCs | **Recommended.** Safe (no RLS, keeps `pin`); see `SECURITY.md` |

## How to apply

No Postgres credentials are checked into the repo, so apply via the
**Supabase Dashboard → SQL Editor** (paste each file in order), or with the CLI
once the project is linked:

```
supabase link --project-ref uasnihapkcrgibnpqdyi
supabase db push
```

## Known caveats

- Column **types** for `employees`, `attendance_logs`, `employee_fingerprints`,
  and `payroll_summary` in `0001` are reconstructed from application code and
  marked `[type inferred]` — these tables exist in prod but never had a committed
  `CREATE`. Verify exact types with:
  ```sql
  SELECT table_name, column_name, data_type FROM information_schema.columns
  WHERE table_schema = 'public' ORDER BY table_name, ordinal_position;
  ```
- **Row-Level Security** is not configured here. Production currently has RLS
  effectively open on all tables; this is handled in a dedicated later migration.
