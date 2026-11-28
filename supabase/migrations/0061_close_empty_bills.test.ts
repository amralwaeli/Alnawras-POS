/** Executes 0061 on a real Postgres (see testdb.ts). Tests run in order and share state. */
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDb, as, fails, one } from './testdb';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEV_A = '11111111-1111-1111-1111-111111111111';
const DEV_B = '22222222-2222-2222-2222-222222222222';
let db: PGlite;

const voidSql = `SELECT public.void_order_item($1, $2, $3, 'wrong', 'u1', 'Sara')`;
const voidItem = (item: string, order: string) =>
  as(db, 'authenticated', DEV_A, () => db.query(voidSql, [item, order, 'A']));
const item = (id: string, oid: string, status = 'served') =>
  `('${id}', '${oid}', 'tea', 'Tea', 1, 10, 10, 'w', 'W', 'A', '${status}')`;
const table = (id: string) =>
  db.query<any>(`SELECT status, current_order_id FROM tables WHERE id = $1`, [id]).then(r => r.rows[0]);
const status = (id: string) => one(db, `SELECT status FROM orders WHERE id = $1`, [id]);

beforeAll(async () => {
  db = await makeDb();
  await db.exec(`
    INSERT INTO organizations(id, name) VALUES ('o', 'O');
    INSERT INTO branches(id, org_id, name) VALUES ('A', 'o', 'A'), ('B', 'o', 'B');
    INSERT INTO branch_logins(auth_uid, branch_id) VALUES ('${DEV_A}', 'A'), ('${DEV_B}', 'B');
    INSERT INTO products(id, name, category, price, branch_id) VALUES ('tea', 'Tea', 'Drinks', 10, 'A');
    INSERT INTO tables(id, number, capacity, branch_id, status, current_order_id, ordering_enabled, needs_waiter)
      VALUES ('t1', 1, 4, 'A', 'occupied', 'o1', true, true), ('t2', 2, 4, 'A', 'occupied', 'o2', false, false),
             ('t3', 3, 4, 'A', 'occupied', 'o3', false, false), ('t16', 16, 4, 'A', 'occupied', 'old', false, false),
             ('t17', 17, 4, 'A', 'occupied', 'fresh', false, false), ('t18', 18, 4, 'A', 'occupied', 'live', false, false),
             ('t19', 19, 4, 'A', 'occupied', 'live19', false, false);
    INSERT INTO orders(id, table_id, table_number, status, order_type, branch_id, subtotal, total, created_at)
      VALUES ('o1', 't1', 1, 'open', 'dine-in', 'A', 10, 10, now()),
             ('o2', 't2', 2, 'open', 'dine-in', 'A', 20, 20, now()),
             ('o3', 't3', 3, 'open', 'dine-in', 'A', 10, 10, now()),
             ('old', 't16', 16, 'open', 'dine-in', 'A', 0, 0, now() - interval '1 hour'),
             ('fresh', 't17', 17, 'open', 'dine-in', 'A', 0, 0, now()),
             ('live', 't18', 18, 'open', 'dine-in', 'A', 10, 10, now() - interval '1 hour'),
             ('ghost', 't19', 19, 'open', 'dine-in', 'A', 0, 0, now() - interval '1 hour'),
             ('live19', 't19', 19, 'open', 'dine-in', 'A', 10, 10, now());
    INSERT INTO orders(id, table_number, status, order_type, branch_id, subtotal, total, payment_status)
      VALUES ('pk', 0, 'open', 'pickup', 'A', 10, 10, 'paid'), ('pv', 0, 'open', 'pickup', 'A', 10, 10, 'pending_verification'),
             ('pu', 0, 'open', 'pickup', 'A', 10, 10, 'unpaid');
    INSERT INTO pickup_tokens(id, token, branch_id, order_id, status) VALUES ('k1', 'tokpu', 'A', 'pu', 'ordered');
    INSERT INTO order_items(id, order_id, product_id, product_name, quantity, price, subtotal, added_by, added_by_name, branch_id, status)
      VALUES ${item('a1', 'o1')}, ${item('b1', 'o2')}, ${item('b2', 'o2')}, ${item('c1', 'o3')},
             ${item('d1', 'old', 'cancelled')}, ${item('e1', 'fresh', 'cancelled')},
             ${item('f1', 'live', 'cancelled')}, ${item('f2', 'live')},
             ${item('g1', 'ghost', 'cancelled')}, ${item('h1', 'live19')},
             ${item('k1', 'pk')}, ${item('k2', 'pv')}, ${item('k3', 'pu')};
    INSERT INTO order_groups(id, table_id, branch_id, order_id) VALUES ('g1', 't1', 'A', 'o1'), ('g19', 't19', 'A', 'live19');
    INSERT INTO guest_sessions(id, group_id, table_id, branch_id, token) VALUES ('s1', 'g1', 't1', 'A', 'tok1');
    INSERT INTO qr_sessions(id, table_id, branch_id) VALUES ('q1', 't1', 'A');
    INSERT INTO order_payments(id, order_id, amount, method, item_ids, branch_id)
      VALUES ('p3', 'o3', 5, 'cash', '[]', 'A');`);
}, 60000);

describe('0061 close empty bills', () => {
  it('voiding the only item cancels the bill and frees the table, party and QR session', async () => {
    await voidItem('a1', 'o1');
    expect(await status('o1')).toBe('cancelled');
    expect(Number(await one(db, `SELECT total FROM orders WHERE id = 'o1'`))).toBe(0);
    expect((await db.query<any>(`SELECT status, current_order_id, ordering_enabled, needs_waiter FROM tables WHERE id = 't1'`)).rows[0])
      .toEqual({ status: 'available', current_order_id: null, ordering_enabled: false, needs_waiter: false });
    expect(await one(db, `SELECT active FROM qr_sessions WHERE id = 'q1'`)).toBe(false);
    expect(await one(db, `SELECT status FROM order_groups WHERE id = 'g1'`)).toBe('closed');
    expect(await one(db, `SELECT status FROM guest_sessions WHERE id = 's1'`)).toBe('closed');
  });

  it('voiding one of two items keeps the bill open and the table occupied', async () => {
    await voidItem('b1', 'o2');
    expect(await status('o2')).toBe('open');
    expect(Number(await one(db, `SELECT total FROM orders WHERE id = 'o2'`))).toBe(10);
    expect(await table('t2')).toEqual({ status: 'occupied', current_order_id: 'o2' });
  });

  it('never closes a bill with a payment', async () => {
    await voidItem('c1', 'o3');
    expect(await status('o3')).toBe('open');
    expect(await table('t3')).toEqual({ status: 'occupied', current_order_id: 'o3' });
  });

  it('never closes a paid or pending_verification pickup', async () => {
    await voidItem('k1', 'pk');
    await voidItem('k2', 'pv');
    expect(await status('pk')).toBe('open');
    expect(await status('pv')).toBe('open');
  });

  it('closing an unpaid pickup expires its pickup token', async () => {
    await voidItem('k3', 'pu');
    expect(await status('pu')).toBe('cancelled');
    expect((await db.query<any>(`SELECT active, status FROM pickup_tokens WHERE id = 'k1'`)).rows[0])
      .toEqual({ active: false, status: 'expired' });
  });

  it('another branch device is still refused', async () => {
    expect(await as(db, 'authenticated', DEV_B, () => fails(db, voidSql, ['b2', 'o2', 'A']))).toMatch(/not signed in to that branch/);
    expect(await as(db, 'authenticated', DEV_B, () => fails(db, voidSql, ['b2', 'o2', 'B']))).toMatch('Order not found');
    expect(await status('o2')).toBe('open');
  });

  it('the cleanup (re-running the migration) closes only old empty unpaid bills', async () => {
    const sql = readFileSync(fileURLToPath(new URL('./0061_close_empty_bills.sql', import.meta.url)), 'utf8');
    await expect(db.exec(sql)).resolves.toBeTruthy();
    expect(await status('old')).toBe('cancelled');
    expect(await table('t16')).toEqual({ status: 'available', current_order_id: null });
    expect(await status('fresh')).toBe('open');
    expect(await table('t17')).toEqual({ status: 'occupied', current_order_id: 'fresh' });
    expect(await status('live')).toBe('open');
    expect(await status('o3')).toBe('open');
    // ghost: its table now points at another live bill, so it is left alone and that party stays open
    expect(await status('ghost')).toBe('open');
    expect(await table('t19')).toEqual({ status: 'occupied', current_order_id: 'live19' });
    expect(await one(db, `SELECT status FROM order_groups WHERE id = 'g19'`)).toBe('active');
  });
});
