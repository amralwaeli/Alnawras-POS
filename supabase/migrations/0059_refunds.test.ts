/** Executes 0059 on a real Postgres (see testdb.ts). Tests run in order and share state. */
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDb, as, one, fails } from './testdb';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEV_A = '11111111-1111-1111-1111-111111111111';
const DEV_B = '22222222-2222-2222-2222-222222222222';
let db: PGlite;

const refund = (dev: string, branch: string, oid: string, items: string[] | null, method: string, reason: string) =>
  as(db, 'authenticated', dev, async () => (await db.query<any>(
    `SELECT public.refund_order($1, $2, $3, $4, $5, 'c1', 'Sara') AS r`, [branch, oid, items, method, reason])).rows[0].r);
const refuse = (dev: string, branch: string, oid: string, items: string[] | null, method: string, reason: string) =>
  as(db, 'authenticated', dev, () => fails(db,
    `SELECT public.refund_order($1, $2, $3, $4, $5, 'c1', 'Sara')`, [branch, oid, items, method, reason]));
const range = `now() - interval '1 day', now() + interval '1 day', 'UTC'`;

beforeAll(async () => {
  db = await makeDb();
  await db.exec(`
    INSERT INTO organizations(id, name) VALUES ('o', 'O');
    INSERT INTO branches(id, org_id, name) VALUES ('A', 'o', 'A'), ('B', 'o', 'B');
    INSERT INTO branch_logins(auth_uid, branch_id) VALUES ('${DEV_A}', 'A'), ('${DEV_B}', 'B');
    INSERT INTO products(id, name, category, price, branch_id) VALUES ('fish', 'Fish', 'Seafood', 20, 'A'), ('tea', 'Tea', 'Drinks', 10, 'A');
    INSERT INTO orders(id, table_number, status, order_type, branch_id, subtotal, tax, discount, total, completed_at, cashier_name, bill_number)
      VALUES ('r1', 5, 'completed', 'dine-in', 'A', 40, 0, 4, 36, now(), 'Sara', '0001'),
             ('r2', 6, 'open', 'dine-in', 'A', 10, 0, 0, 10, null, null, null);
    INSERT INTO order_items(id, order_id, product_id, product_name, quantity, price, subtotal, added_by, added_by_name, branch_id, status)
      VALUES ('i1', 'r1', 'fish', 'Fish', 1, 20, 20, 'w', 'W', 'A', 'served'),
             ('i2', 'r1', 'tea', 'Tea', 1, 10, 10, 'w', 'W', 'A', 'served'),
             ('i3', 'r1', 'tea', 'Tea', 1, 10, 10, 'w', 'W', 'A', 'served'),
             ('i4', 'r2', 'tea', 'Tea', 1, 10, 10, 'w', 'W', 'A', 'served');`);
}, 60000);

describe('0059 refunds', () => {
  it('refunds one item with its share of the discount', async () => {
    const r = await refund(DEV_A, 'A', 'r1', ['i1'], 'cash', 'Cold food');
    expect(Number(r.amount)).toBe(18);
    expect(r.item_ids).toEqual(['i1']);
    expect(r.refund_id).toMatch(/^ref-/);
    expect(await one(db, `SELECT refund_id FROM order_items WHERE id = 'i1'`)).toBe(r.refund_id);
    expect(await one(db, `SELECT refund_id FROM order_items WHERE id = 'i2'`)).toBeNull();
  });

  it('the same item cannot be refunded twice', async () => {
    expect(await refuse(DEV_A, 'A', 'r1', ['i1'], 'cash', 'Again')).toMatch('This item was already refunded');
    expect(await refuse(DEV_A, 'A', 'r1', ['i4'], 'cash', 'Wrong bill')).toMatch('This item is not on this bill');
  });

  it('refunding the rest returns exactly what is left of the bill', async () => {
    const r = await refund(DEV_A, 'A', 'r1', null, 'card', 'Guest unhappy');
    expect(Number(r.amount)).toBe(18);
    expect([...r.item_ids].sort()).toEqual(['i2', 'i3']);
    expect(Number(await one(db, `SELECT SUM(amount) FROM refunds WHERE order_id = 'r1'`))).toBe(36);
    expect(await refuse(DEV_A, 'A', 'r1', null, 'cash', 'More')).toMatch('Nothing left to refund');
  });

  it('refuses an open bill, a bad reason or method, and another branch', async () => {
    expect(await refuse(DEV_A, 'A', 'r2', null, 'cash', 'x')).toMatch('Only a paid bill can be refunded');
    expect(await refuse(DEV_A, 'A', 'r1', null, 'cash', '   ')).toMatch(/reason/);
    expect(await refuse(DEV_A, 'A', 'r1', null, 'bitcoin', 'x')).toMatch('Invalid refund method');
    expect(await refuse(DEV_B, 'A', 'r1', null, 'cash', 'x')).toMatch(/not signed in to that branch/);
    expect(await refuse(DEV_B, 'B', 'r1', null, 'cash', 'x')).toMatch('Only a paid bill can be refunded');
  });

  it('sales summary shows refunds on the refund day, revenue unchanged', async () => {
    const s = await as(db, 'authenticated', DEV_A, () => one<any>(db, `SELECT public.get_sales_summary('A', ${range})`));
    expect(Number(s.revenue)).toBe(36);
    expect(Number(s.refunds)).toBe(36);
    expect(s.refunds_by_method).toEqual({ cash: 18, card: 18 });
    const old = await as(db, 'authenticated', DEV_A, () => one<any>(db,
      `SELECT public.get_sales_summary('A', now() - interval '3 days', now() - interval '2 days', 'UTC')`));
    expect([Number(old.refunds), old.refunds_by_method]).toEqual([0, {}]);
  });

  it('detail report lists the refunds, newest first', async () => {
    const d = await as(db, 'authenticated', DEV_A, () => one<any>(db, `SELECT public.get_detail_report('A', ${range})`));
    expect(d.refunds.count).toBe(2);
    expect(Number(d.refunds.total)).toBe(36);
    expect(d.refunds.list).toHaveLength(2);
    expect(d.refunds.list.find((x: any) => x.method === 'cash'))
      .toMatchObject({ bill: '0001', table: 5, type: 'dine-in', amount: 18, reason: 'Cold food', by: 'Sara', items: ['Fish'] });
    expect(d.refunds.list.find((x: any) => x.method === 'card').items).toEqual(['Tea', 'Tea']);
    expect(d.discounts).toBeTruthy();   // existing keys kept
  });

  it('refunds are readable only by the own branch and never writable directly', async () => {
    expect(await as(db, 'authenticated', DEV_A, () => one(db, `SELECT COUNT(*) FROM refunds`))).toBe(2);
    expect(await as(db, 'authenticated', DEV_B, () => one(db, `SELECT COUNT(*) FROM refunds`))).toBe(0);
    expect(await as(db, 'anon', null, () => fails(db, `SELECT * FROM refunds`))).toMatch(/permission denied/);
    expect(await as(db, 'authenticated', DEV_A, () => fails(db,
      `INSERT INTO refunds(id, branch_id, order_id, amount, method, reason) VALUES ('x', 'A', 'r1', 1, 'cash', 'x')`)))
      .toMatch(/permission denied/);
    expect(await as(db, 'anon', null, () => fails(db,
      `SELECT public.refund_order('A', 'r1', NULL, 'cash', 'x', NULL, NULL)`))).toMatch(/permission denied/);
  });

  it("account refund credits the bill's customer account, up to what was charged", async () => {
    await db.exec(`
      INSERT INTO debt_accounts(id, branch_id, name) VALUES ('acc1', 'A', 'Ali');
      INSERT INTO orders(id, table_number, status, order_type, branch_id, subtotal, tax, discount, total, completed_at, bill_number)
        VALUES ('r3', 7, 'completed', 'dine-in', 'A', 30, 0, 0, 30, now() - interval '10 days', '0003'),
               ('r4', 8, 'completed', 'dine-in', 'A', 10, 0, 0, 10, now() - interval '10 days', '0004');
      INSERT INTO order_items(id, order_id, product_id, product_name, quantity, price, subtotal, added_by, added_by_name, branch_id, status)
        VALUES ('i5', 'r3', 'fish', 'Fish', 1, 20, 20, 'w', 'W', 'A', 'served'),
               ('i6', 'r3', 'tea', 'Tea', 1, 10, 10, 'w', 'W', 'A', 'served'),
               ('i7', 'r4', 'tea', 'Tea', 1, 10, 10, 'w', 'W', 'A', 'served');
      INSERT INTO debt_entries(branch_id, account_id, kind, amount, order_id) VALUES ('A', 'acc1', 'charge', 25, 'r3');`);
    const bal = async () => Number(await one(db, `SELECT public._debt_balance('acc1')`));
    expect(await bal()).toBe(25);                    // 25 on account + 5 cash
    expect(Number((await refund(DEV_A, 'A', 'r3', ['i5'], 'account', 'Wrong dish')).amount)).toBe(20);
    expect(await bal()).toBe(5);
    expect(await refuse(DEV_A, 'A', 'r3', ['i6'], 'account', 'x')).toMatch('more than is left on the customer account');
    expect(await bal()).toBe(5);
  });

  it('an account refund on a bill not charged to an account is refused', async () => {
    expect(await refuse(DEV_A, 'A', 'r4', null, 'account', 'x'))
      .toMatch('This bill was not charged to a customer account — choose cash, card or QR');
    expect(await one(db, `SELECT COUNT(*) FROM refunds WHERE order_id = 'r4'`)).toBe(0);
  });

  it('the migration is idempotent', async () => {
    const sql = readFileSync(fileURLToPath(new URL('./0059_refunds.sql', import.meta.url)), 'utf8');
    await expect(db.exec(sql)).resolves.toBeTruthy();
  });
});
