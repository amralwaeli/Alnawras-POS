/** Executes 0060 on a real Postgres (see testdb.ts). Tests run in order and share state. */
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDb, as, fails, one } from './testdb';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEV_A = '11111111-1111-1111-1111-111111111111';
const DEV_B = '22222222-2222-2222-2222-222222222222';
let db: PGlite;

const merge = (dev: string, branch: string, from: string, into: string) =>
  as(db, 'authenticated', dev, async () => (await db.query<any>(
    `SELECT public.merge_orders($1, $2, $3, 'Sara') AS r`, [branch, from, into])).rows[0].r);
const refuse = (dev: string, branch: string, from: string, into: string) =>
  as(db, 'authenticated', dev, () => fails(db, `SELECT public.merge_orders($1, $2, $3, 'Sara')`, [branch, from, into]));
const item = (id: string, oid: string, sub: number, extra = `'served', '2026-11-01T10:00:00Z'`) =>
  `('${id}', '${oid}', 'tea', 'Tea', 1, ${sub}, ${sub}, 'w', 'W', 'A', ${extra})`;

beforeAll(async () => {
  db = await makeDb();
  await db.exec(`
    INSERT INTO organizations(id, name) VALUES ('o', 'O');
    INSERT INTO branches(id, org_id, name) VALUES ('A', 'o', 'A'), ('B', 'o', 'B');
    INSERT INTO branch_logins(auth_uid, branch_id) VALUES ('${DEV_A}', 'A'), ('${DEV_B}', 'B');
    INSERT INTO products(id, name, category, price, branch_id) VALUES ('tea', 'Tea', 'Drinks', 10, 'A');
    INSERT INTO tables(id, number, capacity, branch_id, status, current_order_id, ordering_enabled, needs_waiter)
      VALUES ('t5', 5, 4, 'A', 'occupied', 'o5', true, true), ('t7', 7, 4, 'A', 'occupied', 'o7', false, false),
             ('t8', 8, 4, 'A', 'occupied', 'o8', false, false);
    INSERT INTO orders(id, table_id, table_number, status, order_type, branch_id, subtotal, tax, discount, total, waiters)
      VALUES ('o5', 't5', 5, 'open', 'dine-in', 'A', 20, 0, 0, 20, '["w1","w2"]'),
             ('o7', 't7', 7, 'open', 'dine-in', 'A', 15, 0, 2, 15, '["w2"]'),
             ('tk', NULL, 0, 'open', 'takeaway', 'A', 12, 0, 0, 12, '[]'),
             ('o8', 't8', 8, 'open', 'dine-in', 'A', 10, 0, 0, 10, '[]'),
             ('done', NULL, 0, 'completed', 'takeaway', 'A', 10, 0, 0, 10, '[]');
    INSERT INTO order_items(id, order_id, product_id, product_name, quantity, price, subtotal, added_by, added_by_name, branch_id, status, printed_at)
      VALUES ${item('a1', 'o5', 20)}, ${item('a2', 'o5', 30, `'cancelled', '2026-11-01T10:05:00Z'`)},
             ${item('b1', 'o7', 15, `'pending', NULL`)}, ${item('c1', 'tk', 12)}, ${item('d1', 'o8', 10)};
    INSERT INTO order_groups(id, table_id, branch_id, order_id) VALUES ('g5', 't5', 'A', 'o5');
    INSERT INTO guest_sessions(id, group_id, table_id, branch_id, token) VALUES ('s5', 'g5', 't5', 'A', 'tok5');
    INSERT INTO qr_sessions(id, table_id, branch_id) VALUES ('q5', 't5', 'A');
    INSERT INTO order_payments(id, order_id, amount, method, item_ids, branch_id)
      VALUES ('p8', 'o8', 10, 'cash', '["d1"]', 'A');`);
}, 60000);

describe('0060 merge orders', () => {
  it('merges table 5 into table 7: items, totals, tables, print state', async () => {
    const before = await db.query<any>(`SELECT id, printed_at, status FROM order_items ORDER BY id`);
    const r = await merge(DEV_A, 'A', 'o5', 'o7');
    expect(r).toEqual({ into_order_id: 'o7', moved_items: 2 });
    expect((await db.query<any>(`SELECT id FROM order_items WHERE order_id = 'o7' ORDER BY id`)).rows.map(x => x.id))
      .toEqual(['a1', 'a2', 'b1']);
    const o7 = (await db.query<any>(`SELECT subtotal, tax, discount, total, waiters FROM orders WHERE id = 'o7'`)).rows[0];
    expect([Number(o7.subtotal), Number(o7.tax), Number(o7.discount), Number(o7.total)]).toEqual([35, 0, 2, 35]);
    expect([...o7.waiters].sort()).toEqual(['w1', 'w2']);
    expect(await one(db, `SELECT COUNT(*) FROM orders WHERE id = 'o5'`)).toBe(0);
    expect((await db.query<any>(`SELECT status, current_order_id, ordering_enabled, needs_waiter FROM tables WHERE id = 't5'`)).rows[0])
      .toEqual({ status: 'available', current_order_id: null, ordering_enabled: false, needs_waiter: false });
    expect((await db.query<any>(`SELECT status, current_order_id FROM tables WHERE id = 't7'`)).rows[0])
      .toEqual({ status: 'occupied', current_order_id: 'o7' });
    expect(await one(db, `SELECT status FROM order_groups WHERE id = 'g5'`)).toBe('closed');
    expect(await one(db, `SELECT status FROM guest_sessions WHERE id = 's5'`)).toBe('closed');
    expect(await one(db, `SELECT active FROM qr_sessions WHERE id = 'q5'`)).toBe(false);
    expect((await db.query<any>(`SELECT id, printed_at, status FROM order_items ORDER BY id`)).rows).toEqual(before.rows);
    expect(await one(db, `SELECT details->>'from' FROM audit_logs WHERE action = 'order.merged'`)).toBe('o5');
  });

  it('merges a takeaway into a table', async () => {
    expect(await merge(DEV_A, 'A', 'tk', 'o7')).toEqual({ into_order_id: 'o7', moved_items: 1 });
    expect(Number(await one(db, `SELECT total FROM orders WHERE id = 'o7'`))).toBe(47);
    expect(await one(db, `SELECT COUNT(*) FROM orders WHERE id = 'tk'`)).toBe(0);
    expect(await one(db, `SELECT status FROM tables WHERE id = 't7'`)).toBe('occupied');
  });

  it('refuses a partly paid, a completed or the same bill, and another branch', async () => {
    expect(await refuse(DEV_A, 'A', 'o8', 'o7')).toMatch('A bill that is partly paid cannot be merged — finish the split first');
    expect(await refuse(DEV_A, 'A', 'o7', 'o8')).toMatch('partly paid');
    expect(await refuse(DEV_A, 'A', 'done', 'o7')).toMatch('Both bills must be open');
    expect(await refuse(DEV_A, 'A', 'o7', 'o7')).toMatch('Choose a different bill');
    expect(await refuse(DEV_B, 'A', 'o8', 'o7')).toMatch(/not signed in to that branch/);
    expect(await refuse(DEV_B, 'B', 'o8', 'o7')).toMatch('Order not found');
    expect(await as(db, 'anon', null, () => fails(db, `SELECT public.merge_orders('A', 'o8', 'o7', 'x')`)))
      .toMatch(/permission denied/);
    expect(await one(db, `SELECT COUNT(*) FROM order_items WHERE order_id = 'o8'`)).toBe(1);
  });

  it('the migration is idempotent', async () => {
    const sql = readFileSync(fileURLToPath(new URL('./0060_merge_orders.sql', import.meta.url)), 'utf8');
    await expect(db.exec(sql)).resolves.toBeTruthy();
  });
});
