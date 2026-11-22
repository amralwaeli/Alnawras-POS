/** Executes 0043 on a real Postgres (see testdb.ts) shaped like the live project. */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import type { PGlite } from '@electric-sql/pglite';
import { makeDb, one, fails } from './testdb';

const SQL = readFileSync(new URL('./0043_reconcile_live_drift.sql', import.meta.url), 'utf8');
let db: PGlite;

beforeAll(async () => {
  db = await makeDb();   // all migrations, 0043 included (a no-op on a fresh database)
  // Recreate the live project's hand-made drift, then run 0043 again.
  await db.exec(`
    CREATE PUBLICATION supabase_realtime;
    ALTER TABLE orders ALTER COLUMN waiters DROP DEFAULT;
    ALTER TABLE orders ALTER COLUMN waiters TYPE text[] USING '{}'::text[];
    ALTER TABLE orders ALTER COLUMN waiters SET DEFAULT '{}'::text[];
    ALTER TABLE customers ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE loyalty_transactions ADD COLUMN customer_name text NOT NULL;
    ALTER TABLE payroll_summary ALTER COLUMN monthly_salary DROP DEFAULT;
    INSERT INTO organizations(id, name) VALUES ('o', 'O');
    INSERT INTO branches(id, org_id, name) VALUES ('A', 'o', 'A');`);
  expect(await fails(db, `INSERT INTO orders(id, table_number, status, order_type, branch_id, waiters, subtotal, tax, total)
    VALUES ('before', 0, 'open', 'pickup', 'A', '[]'::jsonb, 0, 0, 0)`)).toMatch(/waiters/);   // the live failure
  await db.exec(SQL);
  await db.exec(SQL);   // safe to run twice
}, 120000);

describe('0043 reconcile live drift', () => {
  it('lets customer QR / group / pickup orders be created again', async () => {
    expect(await fails(db, `INSERT INTO orders(id, table_number, status, order_type, branch_id, waiters, subtotal, tax, total)
      VALUES ('o1', 0, 'open', 'pickup', 'A', '[]'::jsonb, 0, 0, 0)`)).toBeNull();
  });

  it('gives new loyalty customers an id and lets points be recorded', async () => {
    expect(await fails(db, `INSERT INTO customers(name, phone, branch_id) VALUES ('Ali', '0123', 'A')`)).toBeNull();
    const cust = await one<string>(db, `SELECT id::text FROM customers WHERE phone = '0123'`);
    expect(await fails(db, `INSERT INTO loyalty_transactions(id, customer_id, order_id, type, points, description, branch_id)
      VALUES (gen_random_uuid(), $1, 'o1', 'earn', 5, 'd', 'A')`, [cust])).toBeNull();
  });

  it('puts the app\'s live tables in the realtime publication', async () => {
    const n = await one<number>(db, `SELECT count(*)::int FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
      AND tablename IN ('orders', 'order_items', 'tables', 'products', 'categories', 'attendance_logs')`);
    expect(n).toBe(6);
  });
});
