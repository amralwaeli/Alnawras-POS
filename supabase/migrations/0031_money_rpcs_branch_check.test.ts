/** Executes 0031 on a real Postgres (see testdb.ts). */
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDb, as, fails, one } from './testdb';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEV_A = '11111111-1111-1111-1111-111111111111';
const DEV_B = '22222222-2222-2222-2222-222222222222';
const CUST_A = 'aaaaaaaa-0000-0000-0000-000000000000';

let db: PGlite;
const asA = <R>(fn: () => Promise<R>) => as(db, 'authenticated', DEV_A, fn);
const asB = <R>(fn: () => Promise<R>) => as(db, 'authenticated', DEV_B, fn);
const asAnon = <R>(fn: () => Promise<R>) => as(db, 'anon', null, fn);

const CALLS: [string, string][] = [
  ['submit_order_items', `SELECT * FROM public.submit_order_items('oA', 'A', 'u', 'U', '[{"product_id":"p1","quantity":1}]'::jsonb)`],
  ['pay_order_items', `SELECT * FROM public.pay_order_items('oA', ARRAY['none'], 'cash', NULL, 'u', 'U', 'A')`],
  ['move_order_to_table', `SELECT * FROM public.move_order_to_table('oA', 't2', 'A')`],
  ['next_bill_number', `SELECT public.next_bill_number('A', 'takeaway')`],
  ['earn_loyalty_points', `SELECT public.earn_loyalty_points('${CUST_A}', 'oA', 5, 10, 'A')`],
  ['redeem_loyalty_points', `SELECT public.redeem_loyalty_points('${CUST_A}', 'oA', 1, 'A')`],
  ['adjust_loyalty_points', `SELECT public.adjust_loyalty_points('${CUST_A}', 1, 'x', 'A')`],
  ['get_product_sales', `SELECT * FROM public.get_product_sales('A', NOW() - interval '1 day', NOW())`],
];

beforeAll(async () => {
  db = await makeDb();
  await db.exec(`
    INSERT INTO organizations(id, name) VALUES ('o', 'O');
    INSERT INTO branches(id, org_id, name) VALUES ('A', 'o', 'A'), ('B', 'o', 'B');
    INSERT INTO branch_logins(auth_uid, branch_id) VALUES ('${DEV_A}', 'A'), ('${DEV_B}', 'B');
    INSERT INTO tables(id, number, capacity, branch_id) VALUES ('t1', 1, 4, 'A'), ('t2', 2, 4, 'A');
    INSERT INTO products(id, name, category, price, branch_id) VALUES ('p1', 'Tea', 'Drinks', 3, 'A');
    INSERT INTO orders(id, table_id, table_number, status, branch_id) VALUES ('oA', 't1', 1, 'open', 'A');
    INSERT INTO customers(id, name, phone, branch_id, points_balance, total_spent, total_visits)
      VALUES ('${CUST_A}', 'C', '1', 'A', 10, 0, 0);`);
}, 60000);

describe('money functions', () => {
  it.each(CALLS)('%s refuses anonymous callers', async (_n, sql) => {
    expect(await asAnon(() => fails(db, sql))).toMatch(/permission denied/);
  });

  it.each(CALLS)("%s refuses another branch's device", async (_n, sql) => {
    expect(await asB(() => fails(db, sql))).toMatch(/not signed in to that branch/);
  });

  it("work for the branch's own device, end to end", async () => {
    await asA(async () => {
      const items = await db.query<any>(CALLS[0][1]);                      // add an item, server-priced
      expect(Number(items.rows[0].price)).toBe(3);
      expect(await one(db, `SELECT public.next_bill_number('A', 'takeaway')`)).toMatch(/^\d{4}$/);
      expect(await fails(db, `SELECT public.earn_loyalty_points('${CUST_A}', 'oA', 5, 10, 'A')`)).toBeNull();
      expect(await fails(db, `SELECT * FROM public.get_product_sales('A', NOW() - interval '1 day', NOW())`)).toBeNull();
      const paid = await db.query<any>(`SELECT * FROM public.pay_order_items('oA', ARRAY[$1], 'cash', NULL, 'u', 'U', 'A')`, [items.rows[0].id]);
      expect(paid.rows[0].order_completed).toBe(true);
    });
  });

  it('moves an open order to a free table', async () => {
    await db.exec(`INSERT INTO orders(id, table_id, table_number, status, branch_id) VALUES ('oM', 't1', 1, 'open', 'A');
                   UPDATE tables SET status = 'occupied', current_order_id = 'oM' WHERE id = 't1';`);
    const r = await asA(() => db.query<any>(`SELECT * FROM public.move_order_to_table('oM', 't2', 'A')`));
    expect(r.rows[0]).toMatchObject({ from_table_id: 't1', to_table_number: 2 });
    expect(await one(db, `SELECT table_id FROM orders WHERE id = 'oM'`)).toBe('t2');
  });

  it('loyalty refuses a customer from another branch even with the right device', async () => {
    await db.exec(`INSERT INTO customers(id, name, phone, branch_id, points_balance, total_spent, total_visits)
      VALUES ('bbbbbbbb-0000-0000-0000-000000000000', 'D', '2', 'B', 10, 0, 0)`);
    expect(await asA(() => fails(db, `SELECT public.adjust_loyalty_points('bbbbbbbb-0000-0000-0000-000000000000', 5, 'x', 'A')`)))
      .toMatch(/not found in this branch/);
  });

  it('internals and the old join_table_group are not callable', async () => {
    expect(await asA(() => fails(db, `SELECT public._next_bill_number('A', 'x')`))).toMatch(/permission denied/);
    expect(await asA(() => fails(db, `SELECT * FROM public._get_product_sales_impl('A', NOW(), NOW())`))).toMatch(/permission denied/);
    expect(await asAnon(() => fails(db, `SELECT * FROM public.join_table_group('t1', 'A', 1)`))).toMatch(/permission denied/);
  });

  it('pickup ordering (anon, through 0029) still numbers its bill', async () => {
    await db.exec(`INSERT INTO pickup_tokens(id, token, branch_id, status, active) VALUES ('pk', '${'d'.repeat(64)}', 'A', 'new', true)`);
    const err = await asAnon(() => fails(db, `SELECT public.pickup_submit($1, $2::jsonb, $3::jsonb)`, [
      'd'.repeat(64),
      JSON.stringify({ customerName: 'Ali', customerPhone: '0123456789', method: 'self', payType: 'cash' }),
      JSON.stringify([{ product_id: 'p1', quantity: 1 }]),
    ]));
    expect(err).toBeNull();
  });

  it('is idempotent', async () => {
    const sql = readFileSync(fileURLToPath(new URL('./0031_money_rpcs_branch_check.sql', import.meta.url)), 'utf8');
    await expect(db.exec(sql)).resolves.toBeTruthy();
    expect(await asB(() => fails(db, CALLS[3][1]))).toMatch(/not signed in to that branch/);
  });
});
