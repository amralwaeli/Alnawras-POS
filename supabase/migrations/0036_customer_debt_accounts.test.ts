/** Executes 0036 on a real Postgres (see testdb.ts). */
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDb, as, one, fails } from './testdb';

const DEV_A = '11111111-1111-1111-1111-111111111111';
const DEV_B = '22222222-2222-2222-2222-222222222222';
let db: PGlite;
let n = 0;
const asA = <R>(fn: () => Promise<R>) => as(db, 'authenticated', DEV_A, fn);
const pay = (order: string, payments: any[]) =>
  asA(() => one<any>(db, `SELECT public.pay_order($1, 'A', $2::jsonb, 0, 'u', 'Cashier', NULL, 0)`, [order, JSON.stringify(payments)]));
const payErr = (order: string, payments: any[]) =>
  asA(() => fails(db, `SELECT public.pay_order($1, 'A', $2::jsonb, 0, 'u', 'Cashier', NULL, 0)`, [order, JSON.stringify(payments)]));
const balance = (acc: string) => one<number>(db, `SELECT public._debt_balance($1)::float`, [acc]);
const summary = () => asA(async () => (await db.query<any>(`SELECT * FROM public.debt_account_summary('A')`)).rows);

async function bill(total: number): Promise<string> {
  const id = `o${++n}`;
  await db.exec(`INSERT INTO orders(id, table_number, status, branch_id) VALUES ('${id}', 0, 'open', 'A');
    INSERT INTO order_items(id, order_id, product_id, product_name, quantity, price, subtotal, added_by, added_by_name, branch_id)
      VALUES ('${id}-1', '${id}', 'p1', 'Dish', 1, ${total}, ${total}, 'u', 'U', 'A');`);
  return id;
}

beforeAll(async () => {
  db = await makeDb();
  await db.exec(`
    INSERT INTO organizations(id, name) VALUES ('o', 'O');
    INSERT INTO branches(id, org_id, name) VALUES ('A', 'o', 'A'), ('B', 'o', 'B');
    INSERT INTO branch_logins(auth_uid, branch_id) VALUES ('${DEV_A}', 'A'), ('${DEV_B}', 'B');
    INSERT INTO products(id, name, category, price, branch_id) VALUES ('p1', 'Dish', 'C', 10, 'A');
    INSERT INTO debt_accounts(id, branch_id, name, terms, credit_limit) VALUES
      ('ali', 'A', 'Ali', 'weekly', 100), ('sara', 'A', 'Sara', 'flexible', NULL), ('bob', 'B', 'Bob', 'monthly', NULL);`);
}, 60000);

describe('putting a bill on account', () => {
  it('the whole bill: a sale today (ACCOUNT) and a charge on the account', async () => {
    const o = await bill(40);
    const r = await pay(o, [{ method: 'account', account_id: 'ali' }]);
    expect(r).toMatchObject({ total: 40, payment_summary: 'ACCOUNT' });
    expect(await balance('ali')).toBe(40);
    expect(await one(db, `SELECT method FROM order_payments WHERE order_id = $1`, [o])).toBe('account');
    expect(await one(db, `SELECT note FROM debt_entries WHERE order_id = $1`, [o])).toBe(`Bill ${r.bill_number}`);
  });

  it('part cash, the rest on account', async () => {
    const o = await bill(30);
    await pay(o, [{ method: 'cash', amount: 10 }, { method: 'account', account_id: 'ali', amount: 20 }]);
    expect(await balance('ali')).toBe(60);
  });

  it('refuses a bill that would pass the credit limit, and leaves the bill open', async () => {
    const o = await bill(50);
    expect(await payErr(o, [{ method: 'account', account_id: 'ali' }])).toMatch(/Ali already owes 60.00 .* credit limit of 100.00/);
    expect(await one(db, `SELECT status FROM orders WHERE id = $1`, [o])).toBe('open');
    expect(await balance('ali')).toBe(60);
  });

  it('refuses a missing, closed or other-branch account, and two accounts on one bill', async () => {
    const o = await bill(5);
    expect(await payErr(o, [{ method: 'account' }])).toMatch(/Choose the customer account/);
    expect(await payErr(o, [{ method: 'account', account_id: 'bob' }])).toMatch(/not found/);
    expect(await payErr(o, [{ method: 'account', account_id: 'ali', amount: 2 }, { method: 'account', account_id: 'sara', amount: 3 }]))
      .toMatch(/Only one customer account/);
    await db.exec(`UPDATE debt_accounts SET is_active = false WHERE id = 'sara'`);
    expect(await payErr(o, [{ method: 'account', account_id: 'sara' }])).toMatch(/closed/);
    await db.exec(`UPDATE debt_accounts SET is_active = true WHERE id = 'sara'`);
  });
});

describe('collecting and correcting', () => {
  const collect = (dev: string, branch: string, acc: string, amount: number, method = 'cash') =>
    as(db, 'authenticated', dev, () => fails(db, `SELECT public.record_debt_payment($1, $2, $3, $4, NULL, 'u', 'U')`, [branch, acc, amount, method]));

  it('a payment lowers the balance; more than owed is refused', async () => {
    expect(await collect(DEV_A, 'A', 'ali', 25)).toBeNull();
    expect(await balance('ali')).toBe(35);
    expect(await collect(DEV_A, 'A', 'ali', 36)).toMatch(/owes only 35.00/);
    expect(await collect(DEV_A, 'A', 'ali', 5, 'bitcoin')).toMatch(/Unknown payment method/);
  });

  it('a correction needs a reason', async () => {
    expect(await asA(() => fails(db, `SELECT public.adjust_debt('A', 'ali', -5, ' ', 'u', 'U')`))).toMatch(/reason/);
    await asA(() => db.query(`SELECT public.adjust_debt('A', 'ali', -5, 'Discount agreed', 'u', 'U')`));
    expect(await balance('ali')).toBe(30);
  });

  it("another branch can't see or touch the account; nobody can write the ledger directly", async () => {
    expect(await collect(DEV_B, 'A', 'ali', 1)).toMatch(/not signed in to that branch/);
    expect(await collect(DEV_B, 'B', 'ali', 1)).toMatch(/not found/);
    const seen = await as(db, 'authenticated', DEV_B, () => db.query<any>(`SELECT id FROM debt_accounts UNION ALL SELECT id FROM debt_entries`));
    expect(seen.rows.map(r => r.id)).toEqual(['bob']);
    expect(await asA(() => fails(db, `INSERT INTO debt_entries(branch_id, account_id, kind, amount) VALUES ('A', 'ali', 'payment', 30)`)))
      .toMatch(/permission denied/);
    expect(await as(db, 'anon', null, () => fails(db, `SELECT * FROM debt_accounts`))).toMatch(/permission denied/);
    expect(await asA(() => fails(db, `DELETE FROM debt_accounts WHERE id = 'ali'`))).toMatch(/foreign key|violates/);
  });
});

describe('summary and due dates', () => {
  it('weekly accounts are due 7 days after the oldest unpaid charge, and overdue after that', async () => {
    // Ali: charges 40 (bill 1) + 20 (bill 2) − payment 25 − correction 5 → the first bill still has 10 unpaid.
    await db.exec(`UPDATE debt_entries SET created_at = NOW() - interval '10 days' WHERE account_id = 'ali' AND kind = 'charge' AND amount = 40`);
    const ali = (await summary()).find(r => r.id === 'ali');
    expect(Number(ali.balance)).toBe(30);
    expect(ali.overdue).toBe(true);
    expect(new Date(ali.due_date).getTime()).toBeLessThan(Date.now());
    expect(ali.last_payment_at).not.toBeNull();
  });

  it('once the oldest charge is paid, the next one sets the due date; flexible accounts are never overdue', async () => {
    await asA(() => db.query(`SELECT public.record_debt_payment('A', 'ali', 10, 'cash', NULL, 'u', 'U')`));
    const ali = (await summary()).find(r => r.id === 'ali');
    expect(Number(ali.balance)).toBe(20);
    expect(ali.overdue).toBe(false);
    const o = await bill(15);
    await pay(o, [{ method: 'account', account_id: 'sara' }]);
    await db.exec(`UPDATE debt_entries SET created_at = NOW() - interval '90 days' WHERE account_id = 'sara'`);
    const sara = (await summary()).find(r => r.id === 'sara');
    expect(sara).toMatchObject({ overdue: false, due_date: null });
    expect(await as(db, 'authenticated', DEV_B, () => fails(db, `SELECT * FROM public.debt_account_summary('A')`))).toMatch(/not signed in/);
  });
});
