/** Executes 0039 on a real Postgres (see testdb.ts). */
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDb, as, one, fails } from './testdb';

const DEV_A = '11111111-1111-1111-1111-111111111111';
let db: PGlite;
const asA = <R>(fn: () => Promise<R>) => as(db, 'authenticated', DEV_A, fn);

/** A paid bill N months ago (one tracked line + one cancelled line + a cash payment). */
async function paidBill(id: string, monthsAgo: number, total: number) {
  await db.exec(`
    INSERT INTO orders(id, table_number, status, branch_id, order_type, total, tax, discount, created_at, completed_at, payment_status)
      VALUES ('${id}', 1, 'completed', 'A', 'dine-in', ${total}, 1, 0, now() - interval '${monthsAgo} months', now() - interval '${monthsAgo} months', 'paid');
    INSERT INTO order_items(id, order_id, product_id, product_name, quantity, price, subtotal, added_by, added_by_name, branch_id, status, paid, stock_taken)
      VALUES ('${id}-1', '${id}', 'p1', 'Mandi', 2, ${total / 2}, ${total}, 'u', 'U', 'A', 'served', true, true),
             ('${id}-2', '${id}', 'p1', 'Mandi', 1, 5, 5, 'u', 'U', 'A', 'cancelled', false, false);
    INSERT INTO order_payments(id, order_id, amount, method, item_ids, cashier_id, cashier_name, branch_id)
      VALUES ('${id}-pay', '${id}', ${total}, 'cash', '[]', 'u', 'U', 'A');`);
}

beforeAll(async () => {
  db = await makeDb();
  await db.exec(`
    INSERT INTO organizations(id, name) VALUES ('o', 'O');
    INSERT INTO branches(id, org_id, name) VALUES ('A', 'o', 'A');
    INSERT INTO branch_logins(auth_uid, branch_id) VALUES ('${DEV_A}', 'A');
    INSERT INTO products(id, name, category, price, branch_id, stock, track_stock) VALUES ('p1', 'Mandi', 'C', 20, 'A', 50, true);`);
  await paidBill('old1', 9, 40);
  await paidBill('old2', 9, 60);
  await paidBill('recent', 1, 30);
  await db.exec(`INSERT INTO orders(id, table_number, status, branch_id, created_at) VALUES ('oldopen', 1, 'open', 'A', now() - interval '9 months')`);
}, 60000);

describe('archive', () => {
  it('does nothing while the database is under the limit', async () => {
    expect(await one(db, `SELECT public.archive_if_needed()`)).toBe(0);
    expect(await one(db, `SELECT count(*)::int FROM orders`)).toBe(4);
  });

  it('archives paid bills older than the kept months, keeps totals, never touches open bills or stock', async () => {
    expect(await one(db, `SELECT public.archive_if_needed(0, 6)`)).toBe(2);
    const left = (await db.query<any>(`SELECT id FROM orders ORDER BY id`)).rows.map(r => r.id);
    expect(left).toEqual(['oldopen', 'recent']);
    expect(await one(db, `SELECT count(*)::int FROM order_items WHERE order_id LIKE 'old%'`)).toBe(0);
    expect(await one(db, `SELECT count(*)::int FROM order_payments WHERE order_id LIKE 'old%'`)).toBe(0);
    expect(await one(db, `SELECT stock FROM products WHERE id = 'p1'`)).toBe(50);   // no stock came back

    const arch = (await db.query<any>(`SELECT order_count, revenue::float, data FROM order_archive`)).rows[0];
    expect(arch.order_count).toBe(2);
    expect(arch.revenue).toBe(100);
    expect(arch.data.map((o: any) => o.id).sort()).toEqual(['old1', 'old2']);
    expect(arch.data[0].items).toHaveLength(2);
    expect(arch.data[0].payments).toHaveLength(1);
  });

  it('reports still include the archived months', async () => {
    const s = await asA(() => one<any>(db, `SELECT public.get_sales_summary('A', now() - interval '12 months', now())`));
    expect(Number(s.revenue)).toBe(130);
    expect(Number(s.orders)).toBe(3);
    expect(Number(s.items)).toBe(6);                 // cancelled lines excluded
    expect(Number(s.by_method.cash)).toBe(130);
    expect(Number(s.by_type['dine-in'])).toBe(3);
    const p = await asA(() => db.query<any>(`SELECT * FROM public.get_product_sales('A', now() - interval '12 months', now())`));
    expect(p.rows).toEqual([{ product_id: 'p1', product_name: 'Mandi', units_sold: 6, revenue: '130.00' }]);
  });

  it('archived data is readable by the branch only, and written only by the archive', async () => {
    expect(await asA(() => one(db, `SELECT count(*)::int FROM order_archive`))).toBe(1);
    expect(await asA(() => fails(db, `DELETE FROM order_archive`))).toMatch(/permission denied/);
    expect(await as(db, 'anon', null, () => fails(db, `SELECT * FROM sales_daily`))).toMatch(/permission denied/);
    expect(await asA(() => fails(db, `SELECT public.archive_if_needed(0, 6)`))).toMatch(/permission denied/);
  });
});

describe('cleanup', () => {
  it('removes old temporary rows and keeps recent ones', async () => {
    await db.exec(`INSERT INTO pin_attempts(device_uid, attempted_at) VALUES ('d', now() - interval '2 days'), ('d', now())`);
    const r = await one<any>(db, `SELECT public.cleanup_temporary_data()`);
    expect(r.pin_attempts).toBe(1);
    expect(await one(db, `SELECT count(*)::int FROM pin_attempts`)).toBe(1);
  });

  it('usage is visible to signed-in devices only', async () => {
    const u = await asA(() => one<any>(db, `SELECT public.db_usage()`));
    expect(u.db_limit).toBe(500 * 1024 * 1024);
    expect(Number(u.db_bytes)).toBeGreaterThan(0);
    expect(await as(db, 'anon', null, () => fails(db, `SELECT public.db_usage()`))).toMatch(/permission denied/);
  });
});
