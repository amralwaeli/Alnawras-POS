/** Executes 0047 on a real Postgres (see testdb.ts). */
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDb, as, fails } from './testdb';

const DEV_A = '11111111-1111-1111-1111-111111111111';
const DEV_B = '22222222-2222-2222-2222-222222222222';
let db: PGlite;
let r: any;
const report = (dev: string, branch: string) => as(db, 'authenticated', dev, async () =>
  (await db.query<any>(`SELECT public.get_detail_report($1, now() - interval '1 day', now() + interval '1 day', 'UTC') AS r`, [branch])).rows[0].r);

beforeAll(async () => {
  db = await makeDb();
  await db.exec(`
    INSERT INTO organizations(id, name) VALUES ('o', 'O');
    INSERT INTO branches(id, org_id, name) VALUES ('A', 'o', 'A'), ('B', 'o', 'B');
    INSERT INTO branch_logins(auth_uid, branch_id) VALUES ('${DEV_A}', 'A'), ('${DEV_B}', 'B');
    INSERT INTO products(id, name, category, price, branch_id) VALUES ('fish', 'Fish', 'Seafood', 20, 'A'), ('tea', 'Tea', 'Drinks', 3, 'A');
    INSERT INTO orders(id, table_number, status, order_type, branch_id, subtotal, tax, discount, total, completed_at, cashier_name, bill_number)
      VALUES ('o1', 5, 'completed', 'dine-in', 'A', 46, 0, 6, 40, now(), 'Sara', '0001'),
             ('o2', 0, 'completed', 'takeaway', 'A', 3, 0, 0, 3, now(), 'Sara', '0002'),
             ('o3', 7, 'open', 'dine-in', 'A', 20, 0, 0, 20, null, null, null),
             ('o4', 8, 'cancelled', 'dine-in', 'A', 9, 0, 0, 9, null, null, null);
    INSERT INTO order_items(id, order_id, product_id, product_name, quantity, price, subtotal, added_by, added_by_name, branch_id, status)
      VALUES ('i1', 'o1', 'fish', 'Fish', 2, 20, 40, 'w1', 'Ali', 'A', 'served'),
             ('i2', 'o1', 'tea', 'Tea', 2, 3, 6, 'w1', 'Ali', 'A', 'served'),
             ('i3', 'o2', 'tea', 'Tea', 1, 3, 3, 'w2', 'Mona', 'A', 'served');
    INSERT INTO order_items(id, order_id, product_id, product_name, quantity, price, subtotal, added_by, added_by_name, branch_id,
                            status, cancelled_by_name, cancel_reason, cancelled_at)
      VALUES ('i4', 'o3', 'fish', 'Fish', 1, 20, 20, 'w1', 'Ali', 'A', 'cancelled', 'Omar', 'Took too long', now());
    INSERT INTO order_payments(id, order_id, amount, method, item_ids, cashier_id, cashier_name, branch_id)
      VALUES ('p1', 'o1', 40, 'cash', '[]', 'c1', 'Sara', 'A'), ('p2', 'o2', 3, 'card', '[]', 'c1', 'Sara', 'A');`);
  r = await report(DEV_A, 'A');
}, 60000);

describe('0047 detail reports', () => {
  it('splits sales by category, staff, cashier and table', () => {
    expect(r.by_category).toEqual([{ category: 'Seafood', units: 2, revenue: 40 }, { category: 'Drinks', units: 3, revenue: 9 }]);
    expect(r.by_waiter.find((w: any) => w.name === 'Ali')).toEqual({ name: 'Ali', items: 4, revenue: 46, bills: 1 });
    expect(r.by_cashier).toEqual([{ name: 'Sara', payments: 2, amount: 43 }]);
    expect(r.by_table).toEqual([{ table: 5, bills: 1, revenue: 40 }]);   // dine-in only
    expect(r.by_hour.reduce((s: number, h: any) => s + Number(h.orders), 0)).toBe(2);
  });

  it('lists discounts', () => {
    expect(r.discounts.bills).toBe(1);
    expect(Number(r.discounts.total)).toBe(6);
    expect(r.discounts.list[0].cashier).toBe('Sara');
  });

  it('reports cancelled items with who, why and value, and cancelled bills', () => {
    expect(r.cancellations.items).toBe(1);
    expect(Number(r.cancellations.value)).toBe(20);
    expect(r.cancellations.list[0]).toMatchObject({ product: 'Fish', by: 'Omar', reason: 'Took too long', table: 7, ordered_by: 'Ali' });
    expect(r.cancellations.by_staff).toEqual([{ name: 'Omar', items: 1, value: 20 }]);
    expect(r.cancellations.bills).toBe(1);
  });

  it('is limited to the device\'s own branch', async () => {
    expect(await as(db, 'authenticated', DEV_B, () => fails(db,
      `SELECT public.get_detail_report('A', now() - interval '1 day', now(), 'UTC')`))).toMatch(/not signed in to that branch/);
  });
});
