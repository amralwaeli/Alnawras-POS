/** Executes 0058 on a real Postgres (see testdb.ts). */
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDb, as, one, fails } from './testdb';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEV_A = '11111111-1111-1111-1111-111111111111';
const DEV_B = '22222222-2222-2222-2222-222222222222';
const DEV_T = '33333333-3333-3333-3333-333333333333';
const DEV_I = '44444444-4444-4444-4444-444444444444';
let db: PGlite;

// An open dine-in order with items 15, 26, 40, 14 (ids <order>-1..4).
const order = (id: string, branch: string) => `
  INSERT INTO orders(id, table_number, status, order_type, branch_id, subtotal, tax, total) VALUES ('${id}', 3, 'open', 'dine-in', '${branch}', 0, 0, 0);
  INSERT INTO order_items(id, order_id, product_id, product_name, quantity, price, subtotal, added_by, added_by_name, branch_id, status)
    VALUES ('${id}-1', '${id}', 'p', 'P', 1, 15, 15, 'w', 'W', '${branch}', 'served'),
           ('${id}-2', '${id}', 'p', 'P', 1, 26, 26, 'w', 'W', '${branch}', 'served'),
           ('${id}-3', '${id}', 'p', 'P', 1, 40, 40, 'w', 'W', '${branch}', 'served'),
           ('${id}-4', '${id}', 'p', 'P', 1, 14, 14, 'w', 'W', '${branch}', 'served');`;

const pay8 = (dev: string, oid: string, items: number[], branch: string, pct: number | null) =>
  as(db, 'authenticated', dev, async () => (await db.query<any>(
    `SELECT * FROM public.pay_order_items($1, $2, 'cash', NULL, 'c', 'C', $3, $4)`,
    [oid, items.map(n => `${oid}-${n}`), branch, pct])).rows[0]);
const ord = async (id: string) => (await db.query<any>(`SELECT * FROM orders WHERE id = $1`, [id])).rows[0];

beforeAll(async () => {
  db = await makeDb();
  await db.exec(`
    INSERT INTO organizations(id, name) VALUES ('o', 'O');
    INSERT INTO branches(id, org_id, name) VALUES ('A', 'o', 'A'), ('B', 'o', 'B'), ('T', 'o', 'T'), ('I', 'o', 'I');
    INSERT INTO branch_logins(auth_uid, branch_id) VALUES ('${DEV_A}', 'A'), ('${DEV_B}', 'B'), ('${DEV_T}', 'T'), ('${DEV_I}', 'I');
    INSERT INTO products(id, name, category, price, branch_id) VALUES ('p', 'P', 'C', 1, 'A');
    INSERT INTO branch_settings(branch_id, tax_enabled, tax_rate, tax_inclusive) VALUES ('A', false, 0, false), ('T', true, 6, false), ('I', true, 6, true);
    ${order('s1', 'A')} ${order('s2', 'A')} ${order('t1', 'T')} ${order('n1', 'I')}`);
}, 60000);

describe('0058 split discount', () => {
  it('first guest sets the bill discount', async () => {
    const r = await pay8(DEV_A, 's1', [1, 2], 'A', 10);
    expect(Number(r.amount)).toBe(36.9);
    expect(r.order_completed).toBe(false);
    expect(Number((await ord('s1')).split_discount_pct)).toBe(10);
  });

  it('a later guest with a different % is refused', async () => {
    const err = await as(db, 'authenticated', DEV_A, () => fails(db,
      `SELECT * FROM public.pay_order_items('s1', ARRAY['s1-3'], 'cash', NULL, 'c', 'C', 'A', 20)`));
    expect(err).toMatch('The discount for this bill is already set to 10%');
    expect(await as(db, 'authenticated', DEV_A, () => fails(db,
      `SELECT * FROM public.pay_order_items('s1', ARRAY['s1-3'], 'cash', NULL, 'c', 'C', 'A', 101)`)))
      .toMatch('Discount must be between 0 and 100%');
  });

  it("another branch's device is refused", async () => {
    expect(await as(db, 'authenticated', DEV_B, () => fails(db,
      `SELECT * FROM public.pay_order_items('s1', ARRAY['s1-3'], 'cash', NULL, 'c', 'C', 'A', 10)`)))
      .toMatch(/not signed in to that branch/);
  });

  it('later guests get the same % and the bill completes reconciled', async () => {
    expect(Number((await pay8(DEV_A, 's1', [3], 'A', null)).amount)).toBe(36);
    const r = await pay8(DEV_A, 's1', [4], 'A', 10);
    expect(Number(r.amount)).toBe(12.6);
    expect(r.order_completed).toBe(true);
    const o = await ord('s1');
    expect(o.status).toBe('completed');
    expect([Number(o.total), Number(o.discount), Number(o.subtotal), Number(o.tax)]).toEqual([85.5, 9.5, 95, 0]);
    expect(Number(await one(db, `SELECT SUM(amount) FROM order_payments WHERE order_id = 's1'`))).toBe(85.5);
  });

  it('the old 7-arg call still works, with no discount', async () => {
    const r = await as(db, 'authenticated', DEV_A, async () => (await db.query<any>(
      `SELECT * FROM public.pay_order_items('s2', ARRAY['s2-1','s2-2','s2-3','s2-4'], 'cash', NULL, 'c', 'C', 'A')`)).rows[0]);
    expect([Number(r.amount), r.order_completed]).toEqual([95, true]);
    const o = await ord('s2');
    expect([Number(o.total), Number(o.discount ?? 0), Number(o.split_discount_pct)]).toEqual([95, 0, 0]);
  });

  it('exclusive tax applies after the discount and totals reconcile', async () => {
    const a = await pay8(DEV_T, 't1', [1, 2], 'T', 10);
    expect(Number(a.amount)).toBe(Math.round(Math.round(41 * 0.9 * 100) / 100 * 1.06 * 100) / 100); // 39.11
    const b = await pay8(DEV_T, 't1', [3, 4], 'T', null);
    expect(Number(b.amount)).toBe(51.52);
    const o = await ord('t1');
    const [sub, disc, tax, total] = [o.subtotal, o.discount, o.tax, o.total].map(Number);
    expect([sub, disc, tax, total]).toEqual([95, 9.5, 5.13, 90.63]);
    expect(Math.round((sub - disc + tax) * 100) / 100).toBe(total);
  });

  it('inclusive tax: stored like pay_order (gross subtotal - discount = total, tax inside)', async () => {
    expect(Number((await pay8(DEV_I, 'n1', [1, 2], 'I', 10)).amount)).toBe(36.9);
    expect(Number((await pay8(DEV_I, 'n1', [3, 4], 'I', null)).amount)).toBe(48.6);
    const o = await ord('n1');
    const [sub, disc, tax, total] = [o.subtotal, o.discount, o.tax, o.total].map(Number);
    expect([sub, disc, tax, total]).toEqual([95, 9.5, 4.84, 85.5]);   // 85.5 - 85.5/1.06 = 4.84
    expect(Math.round((sub - disc) * 100) / 100).toBe(total);
  });

  it('internals are not callable, and the migration is idempotent', async () => {
    expect(await as(db, 'authenticated', DEV_A, () => fails(db,
      `SELECT * FROM public._pay_order_items_impl('s1', ARRAY['x'], 'cash', NULL, 'c', 'C', 'A', NULL)`))).toMatch(/permission denied/);
    expect(await as(db, 'anon', null, () => fails(db,
      `SELECT * FROM public.pay_order_items('s1', ARRAY['x'], 'cash', NULL, 'c', 'C', 'A', NULL)`))).toMatch(/permission denied/);
    const sql = readFileSync(fileURLToPath(new URL('./0058_split_discount.sql', import.meta.url)), 'utf8');
    await expect(db.exec(sql)).resolves.toBeTruthy();
  });
});
