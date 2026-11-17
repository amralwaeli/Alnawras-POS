/** Executes 0033 on a real Postgres (see testdb.ts). */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDb, as, one, fails } from './testdb';

const DEV_A = '11111111-1111-1111-1111-111111111111';
const DEV_B = '22222222-2222-2222-2222-222222222222';
const CUST = 'cccccccc-0000-0000-0000-000000000000';

let db: PGlite;
let n = 0;
const asA = <R>(fn: () => Promise<R>) => as(db, 'authenticated', DEV_A, fn);
const pay = (order: string, payments: any[], discount = 0, customer: string | null = null, redeem = 0) =>
  asA(() => one<any>(db, `SELECT public.pay_order($1, 'A', $2::jsonb, $3, 'u', 'Cashier', $4::uuid, $5)`,
    [order, JSON.stringify(payments), discount, customer, redeem]));
const payErr = (order: string, payments: any[], discount = 0, customer: string | null = null, redeem = 0) =>
  asA(() => fails(db, `SELECT public.pay_order($1, 'A', $2::jsonb, $3, 'u', 'Cashier', $4::uuid, $5)`,
    [order, JSON.stringify(payments), discount, customer, redeem]));

/** An open bill on table t1 with lines of the given prices. */
async function bill(prices: number[], table: string | null = 't1'): Promise<string> {
  const id = `o${++n}`;
  await db.exec(`INSERT INTO orders(id, table_id, table_number, status, branch_id) VALUES ('${id}', ${table ? `'${table}'` : 'NULL'}, 1, 'open', 'A');`
    + (table ? `UPDATE tables SET status = 'occupied', current_order_id = '${id}' WHERE id = '${table}';` : ''));
  for (const [i, p] of prices.entries()) {
    await db.exec(`INSERT INTO order_items(id, order_id, product_id, product_name, quantity, price, subtotal, added_by, added_by_name, branch_id)
                   VALUES ('${id}-${i}', '${id}', 'p1', 'Dish', 1, ${p}, ${p}, 'u', 'U', 'A')`);
  }
  return id;
}

beforeAll(async () => {
  db = await makeDb();
  await db.exec(`
    INSERT INTO organizations(id, name) VALUES ('o', 'O');
    INSERT INTO branches(id, org_id, name) VALUES ('A', 'o', 'A'), ('B', 'o', 'B');
    INSERT INTO branch_logins(auth_uid, branch_id) VALUES ('${DEV_A}', 'A'), ('${DEV_B}', 'B');
    INSERT INTO tables(id, number, capacity, branch_id) VALUES ('t1', 1, 4, 'A');
    INSERT INTO products(id, name, category, price, branch_id) VALUES ('p1', 'Dish', 'C', 10, 'A');
    INSERT INTO customers(id, name, phone, branch_id, points_balance, total_spent, total_visits)
      VALUES ('${CUST}', 'Fatima', '0123456789', 'A', 500, 0, 0);`);
}, 60000);

beforeEach(async () => {
  await db.exec(`DELETE FROM branch_settings`);
});

describe('pay_order', () => {
  it('computes the bill on the server and ignores what the browser thinks it is', async () => {
    const o = await bill([10, 15]);
    const r = await pay(o, [{ method: 'cash' }]);
    expect(r).toMatchObject({ subtotal: 25, total: 25, tax: 0, payment_summary: 'CASH' });
    expect(r.bill_number).toMatch(/^\d{4}$/);
    const row = (await db.query<any>(`SELECT status, payment_status FROM orders WHERE id = $1`, [o])).rows[0];
    expect(row).toEqual({ status: 'completed', payment_status: 'paid' });
    expect(await one(db, `SELECT status FROM tables WHERE id = 't1'`)).toBe('available');
    expect(Number(await one(db, `SELECT SUM(amount) FROM order_payments WHERE order_id = $1`, [o]))).toBe(25);
  });

  it('cannot be paid twice', async () => {
    const o = await bill([10]);
    await pay(o, [{ method: 'card' }]);
    expect(await payErr(o, [{ method: 'card' }])).toMatch(/already been paid/);
    expect(await one(db, `SELECT count(*)::int FROM order_payments WHERE order_id = $1`, [o])).toBe(1);
  });

  it('applies exclusive and inclusive tax like the till', async () => {
    await db.exec(`INSERT INTO branch_settings(branch_id, tax_enabled, tax_rate, tax_inclusive) VALUES ('A', true, 6, false)`);
    expect(await pay(await bill([100]), [{ method: 'cash' }])).toMatchObject({ tax: 6, total: 106 });
    await db.exec(`UPDATE branch_settings SET tax_inclusive = true WHERE branch_id = 'A'`);
    expect(await pay(await bill([106]), [{ method: 'cash' }])).toMatchObject({ tax: 6, total: 106 });
  });

  it('caps a discount at the bill; a fully discounted bill closes as NO CHARGE', async () => {
    const o = await bill([20]);
    expect(await pay(o, [{ method: 'cash' }], 999)).toMatchObject({ discount: 20, total: 0, payment_summary: 'NO CHARGE' });
    expect(await one(db, `SELECT count(*)::int FROM order_payments WHERE order_id = $1`, [o])).toBe(0);
  });

  it('mixed payment must equal the server total', async () => {
    const o = await bill([30]);
    expect(await payErr(o, [{ method: 'cash', amount: 10 }, { method: 'card', amount: 10 }])).toMatch(/add up to 20(\.00)? but the bill is 30/);
    const r = await pay(o, [{ method: 'cash', amount: 10 }, { method: 'card', amount: 20 }]);
    expect(r.payment_summary).toBe('CASH 10.00 + CARD 20.00');
    expect(await one(db, `SELECT count(*)::int FROM order_payments WHERE order_id = $1`, [o])).toBe(2);
  });

  it.each([
    ['an unknown method', [{ method: 'crypto' }], /Unknown payment method/],
    ['no payment', [], /one to three/],
    ['a zero amount', [{ method: 'cash', amount: 0 }, { method: 'card', amount: 10 }], /more than zero/],
  ])('refuses %s', async (_n, payments, msg) => {
    expect(await payErr(await bill([10]), payments as any[])).toMatch(msg as RegExp);
  });

  it('refuses a bill already part-paid by item', async () => {
    const o = await bill([10, 10]);
    await db.exec(`UPDATE order_items SET paid = true WHERE id = '${o}-0'`);
    expect(await payErr(o, [{ method: 'cash' }])).toMatch(/partly paid by item/);
  });

  it('redeems loyalty in the same transaction and earns on the total', async () => {
    await db.exec(`INSERT INTO branch_settings(branch_id) VALUES ('A')`);        // loyalty defaults: 1 pt per RM, 100 pts = RM1, min 100
    const r = await pay(await bill([50]), [{ method: 'cash' }], 0, CUST, 200);
    expect(r).toMatchObject({ discount: 2, total: 48, points_redeemed: 200, points_earned: 48 });
    expect(await one(db, `SELECT points_balance FROM customers WHERE id = $1`, [CUST])).toBe(500 - 200 + 48);
  });

  it('a failed redemption means no discount and no payment', async () => {
    const o = await bill([50]);
    expect(await payErr(o, [{ method: 'cash' }], 0, CUST, 999999)).toMatch(/enough points/);
    expect(await one(db, `SELECT status FROM orders WHERE id = $1`, [o])).toBe('open');
  });

  it("refuses another branch's device and anonymous callers", async () => {
    const o = await bill([10]);
    expect(await as(db, 'authenticated', DEV_B, () => fails(db, `SELECT public.pay_order($1, 'A', '[{"method":"cash"}]'::jsonb, 0, 'u', 'U')`, [o])))
      .toMatch(/not signed in to that branch/);
    expect(await as(db, 'anon', null, () => fails(db, `SELECT public.pay_order($1, 'A', '[{"method":"cash"}]'::jsonb, 0, 'u', 'U')`, [o])))
      .toMatch(/permission denied/);
  });

  it('completes a cash pickup order and closes its link', async () => {
    const o = await bill([12], null);
    await db.exec(`UPDATE orders SET order_type = 'pickup' WHERE id = '${o}';
                   INSERT INTO pickup_tokens(id, token, branch_id, order_id, status, active) VALUES ('pk', '${'e'.repeat(64)}', 'A', '${o}', 'ordered', true)`);
    await pay(o, [{ method: 'cash' }]);
    expect(await one(db, `SELECT pickup_status FROM orders WHERE id = $1`, [o])).toBe('picked');
    expect(await one(db, `SELECT status FROM pickup_tokens WHERE id = 'pk'`)).toBe('completed');
  });
});

describe('void_order_item', () => {
  it('voids an unpaid line and recomputes the bill', async () => {
    const o = await bill([10, 5]);
    await asA(() => db.query(`SELECT public.void_order_item($1, $2, 'A', 'guest changed mind', 'u', 'Manager')`, [`${o}-1`, o]));
    expect(Number(await one(db, `SELECT total FROM orders WHERE id = $1`, [o]))).toBe(10);
    expect(await one(db, `SELECT cancel_reason FROM order_items WHERE id = $1`, [`${o}-1`])).toBe('guest changed mind');
  });

  it('refuses a paid line, a closed bill and a second void', async () => {
    const o = await bill([10, 5]);
    await db.exec(`UPDATE order_items SET paid = true WHERE id = '${o}-0'`);
    const voidSql = `SELECT public.void_order_item($1, $2, 'A', NULL, 'u', 'U')`;
    expect(await asA(() => fails(db, voidSql, [`${o}-0`, o]))).toMatch(/already paid for or voided/);
    await asA(() => db.query(voidSql, [`${o}-1`, o]));
    expect(await asA(() => fails(db, voidSql, [`${o}-1`, o]))).toMatch(/already paid for or voided/);
    const closed = await bill([7]);
    await pay(closed, [{ method: 'cash' }]);
    expect(await asA(() => fails(db, voidSql, [`${closed}-0`, closed]))).toMatch(/already been paid/);
  });
});

describe('get_sales_summary', () => {
  it('counts bills by when they were paid, for any range, with expenses for the same range', async () => {
    await db.exec(`
      INSERT INTO orders(id, table_number, status, branch_id, total, tax, discount, completed_at, order_type)
        VALUES ('old', 1, 'completed', 'A', 100, 6, 0, '2026-01-10 12:00+08', 'dine-in'),
               ('late', 1, 'completed', 'A', 40, 0, 5, '2026-01-11 00:10+08', 'takeaway'),
               ('openo', 1, 'open', 'A', 999, 0, 0, NULL, 'dine-in'),
               ('other', 1, 'completed', 'B', 777, 0, 0, '2026-01-10 12:00+08', 'dine-in');
      INSERT INTO expenses(id, branch_id, description, amount, created_by, created_by_name, date)
        VALUES ('e1', 'A', 'gas', 30, 'u', 'U', '2026-01-10'), ('e2', 'A', 'rent', 500, 'u', 'U', '2025-12-01');`);
    const s = await asA(() => one<any>(db, `SELECT public.get_sales_summary('A', '2026-01-10 00:00+08', '2026-01-12 00:00+08', 'Asia/Kuala_Lumpur')`));
    expect(s).toMatchObject({ revenue: 140, tax: 6, discount: 5, orders: 2, expenses: 30 });
    expect(s.by_day.map((d: any) => d.day)).toEqual(['2026-01-10', '2026-01-11']);  // the 00:10 bill is on the 11th, local time
    expect(s.by_type).toEqual({ 'dine-in': 1, takeaway: 1 });
  });

  it("is limited to the caller's branch and to sane ranges", async () => {
    expect(await as(db, 'authenticated', DEV_B, () => fails(db, `SELECT public.get_sales_summary('A', NOW() - interval '1 day', NOW())`)))
      .toMatch(/not signed in to that branch/);
    expect(await asA(() => fails(db, `SELECT public.get_sales_summary('A', NOW(), NOW() - interval '1 day')`))).toMatch(/Invalid date range/);
    expect(await asA(() => fails(db, `SELECT public.get_sales_summary('A', NOW() - interval '3 years', NOW())`))).toMatch(/a year or less/);
  });
});

describe('customers', () => {
  it('one customer per phone number per branch, ignoring formatting', async () => {
    expect(await fails(db, `INSERT INTO customers(name, phone, branch_id) VALUES ('Dup', '012-345 6789', 'A')`)).toMatch(/duplicate key|unique/);
    expect(await fails(db, `INSERT INTO customers(name, phone, branch_id) VALUES ('Same number, other branch', '0123456789', 'B')`)).toBeNull();
  });
});
