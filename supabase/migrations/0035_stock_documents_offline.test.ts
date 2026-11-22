/** Executes 0035 on a real Postgres (see testdb.ts). */
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDb, as, one, fails } from './testdb';

const DEV_A = '11111111-1111-1111-1111-111111111111';
const DEV_B = '22222222-2222-2222-2222-222222222222';
let db: PGlite;
let n = 0;
const asA = <R>(fn: () => Promise<R>) => as(db, 'authenticated', DEV_A, fn);
const send = (order: string, items: any[]) =>
  asA(() => fails(db, `SELECT * FROM public.submit_order_items($1, 'A', 'u', 'Waiter', $2::jsonb)`, [order, JSON.stringify(items)]));
const stock = (p: string) => one<number>(db, `SELECT stock FROM products WHERE id = $1`, [p]);
async function openBill() {
  const id = `o${++n}`;
  await db.exec(`INSERT INTO orders(id, table_number, status, branch_id) VALUES ('${id}', 1, 'open', 'A')`);
  return id;
}

beforeAll(async () => {
  db = await makeDb();
  await db.exec(`
    INSERT INTO organizations(id, name) VALUES ('o', 'O');
    INSERT INTO branches(id, org_id, name) VALUES ('A', 'o', 'A'), ('B', 'o', 'B');
    INSERT INTO branch_logins(auth_uid, branch_id) VALUES ('${DEV_A}', 'A'), ('${DEV_B}', 'B');
    INSERT INTO products(id, name, category, price, branch_id, stock, track_stock) VALUES
      ('mandi', 'Mandi', 'C', 20, 'A', 3, true),
      ('tea',   'Tea',   'C', 2,  'A', 0, false);`);
}, 60000);

describe('stock', () => {
  it('goes down when a tracked item is sent; untracked items are unaffected', async () => {
    const o = await openBill();
    expect(await send(o, [{ product_id: 'mandi', quantity: 2 }, { product_id: 'tea', quantity: 5 }])).toBeNull();
    expect(await stock('mandi')).toBe(1);
    expect(await stock('tea')).toBe(0);
  });

  it('refuses more than is left, and changes nothing', async () => {
    const o = await openBill();
    expect(await send(o, [{ product_id: 'mandi', quantity: 2 }])).toMatch(/Only 1 Mandi left/);
    expect(await stock('mandi')).toBe(1);
  });

  it('a voided line puts its stock back', async () => {
    const o = await openBill();
    await send(o, [{ product_id: 'mandi', quantity: 1 }]);
    expect(await stock('mandi')).toBe(0);
    const line = await one<string>(db, `SELECT id FROM order_items WHERE order_id = $1`, [o]);
    await asA(() => db.query(`SELECT public.void_order_item($1, $2, 'A', NULL, 'u', 'U')`, [line, o]));
    expect(await stock('mandi')).toBe(1);
  });

  it('a line sold before tracking was switched on gives nothing back', async () => {
    await db.exec(`UPDATE products SET track_stock = false WHERE id = 'mandi'`);
    const o = await openBill();
    await send(o, [{ product_id: 'mandi', quantity: 2 }]);
    await db.exec(`UPDATE products SET track_stock = true, stock = 10 WHERE id = 'mandi'`);
    await db.exec(`UPDATE order_items SET status = 'cancelled' WHERE order_id = '${o}'`);
    expect(await stock('mandi')).toBe(10);
  });

  it('a deleted line, a lowered quantity and a cancelled bill all give stock back', async () => {
    const o = await openBill();
    await send(o, [{ product_id: 'mandi', quantity: 3 }, { product_id: 'mandi', quantity: 2 }]);
    expect(await stock('mandi')).toBe(5);
    const [a, b] = (await db.query<any>(`SELECT id FROM order_items WHERE order_id = $1 ORDER BY quantity DESC`, [o])).rows;
    await db.query(`UPDATE order_items SET quantity = 1 WHERE id = $1`, [a.id]);
    expect(await stock('mandi')).toBe(7);
    await db.query(`DELETE FROM order_items WHERE id = $1`, [b.id]);
    expect(await stock('mandi')).toBe(9);
    await db.exec(`UPDATE orders SET status = 'cancelled' WHERE id = '${o}'`);
    expect(await stock('mandi')).toBe(10);
    await db.exec(`UPDATE orders SET status = 'open' WHERE id = '${o}'; UPDATE orders SET status = 'cancelled' WHERE id = '${o}'`);
    expect(await stock('mandi')).toBe(10); // never twice
    await db.exec(`UPDATE products SET stock = 1 WHERE id = 'mandi'`);
  });

  it('customers see a tracked dish at 0 as sold out', async () => {
    await db.exec(`UPDATE products SET stock = 0 WHERE id = 'mandi';
      INSERT INTO tables(id, number, capacity, branch_id, qr_token, ordering_enabled) VALUES ('t1', 1, 4, 'A', '${'a'.repeat(64)}', true);`);
    const g = await as(db, 'anon', null, () => one<any>(db, `SELECT public.guest_join($1)`, ['a'.repeat(64)]));
    const s = await as(db, 'anon', null, () => one<any>(db, `SELECT public.guest_state($1)`, [g.session_token]));
    expect(s.unavailable_product_ids).toEqual(['mandi']);
    await db.exec(`UPDATE products SET stock = 10 WHERE id = 'mandi'`);
  });
});

describe('offline replay', () => {
  it('the same line sent twice (with its device id) is added once', async () => {
    const o = await openBill();
    const line = { client_id: 'item-0d6f1c7e-5b8a-4c2e-9f11-2a3b4c5d6e7f', product_id: 'tea', quantity: 1 };
    expect(await send(o, [line])).toBeNull();
    expect(await send(o, [line])).toBeNull();
    expect(await one(db, `SELECT count(*)::int FROM order_items WHERE order_id = $1`, [o])).toBe(1);
    expect(Number(await one(db, `SELECT total FROM orders WHERE id = $1`, [o]))).toBe(2);
  });

  it('refuses a device id that is already on another bill', async () => {
    const line = { client_id: 'item-1d6f1c7e-5b8a-4c2e-9f11-2a3b4c5d6e7f', product_id: 'tea', quantity: 1 };
    await send(await openBill(), [line]);
    expect(await send(await openBill(), [line])).toMatch(/already on another bill/);
  });

  it('refuses a malformed device id', async () => {
    expect(await send(await openBill(), [{ client_id: "item-1'; drop", product_id: 'tea', quantity: 1 }])).toMatch(/Invalid line id/);
  });
});

describe('saved invoices and quotations', () => {
  const save = (dev: string, branch: string, kind: string) => as(db, 'authenticated', dev, () => one<any>(db,
    `SELECT public.save_document($1, $2, $3::jsonb, 'u', 'U')`,
    [branch, kind, JSON.stringify({ invoiceTo: { name: 'Ali', phone: '012' }, total: 50, items: [] })]));

  it('numbers each kind sequentially per branch', async () => {
    expect((await save(DEV_A, 'A', 'invoice')).number).toBe('INV-1000');   // 0042: invoices start at 1000
    expect((await save(DEV_A, 'A', 'invoice')).number).toBe('INV-1001');
    expect((await save(DEV_A, 'A', 'quotation')).number).toBe('QUO-0001');
    expect((await save(DEV_B, 'B', 'invoice')).number).toBe('INV-1000');
  });

  it('the public bill-number call cannot move the document counters', async () => {
    expect(await as(db, 'authenticated', DEV_A, () => fails(db, `SELECT public.next_bill_number('A', 'doc-invoice')`))).toMatch(/Unknown order type/);
  });

  it('records the customer of a quotation too', async () => {
    await as(db, 'authenticated', DEV_A, () => db.query(`SELECT public.save_document('A', 'quotation', $1::jsonb, 'u', 'U')`,
      [JSON.stringify({ quotationTo: { name: 'Sara', phone: '013' }, total: 9 })]));
    expect(await one(db, `SELECT customer_name FROM documents WHERE kind = 'quotation' AND number = 'QUO-0002'`)).toBe('Sara');
  });

  it("is readable by the branch's own devices only, and writable only through the function", async () => {
    const seen = await as(db, 'authenticated', DEV_B, () => db.query<any>(`SELECT number FROM documents ORDER BY number`));
    expect(seen.rows.map(r => r.number)).toEqual(['INV-1000']);
    expect(await as(db, 'authenticated', DEV_A, () => fails(db,
      `INSERT INTO documents(branch_id, kind, number, data) VALUES ('A', 'invoice', 'INV-9999', '{}')`))).toMatch(/permission denied/);
    expect(await as(db, 'authenticated', DEV_B, () => fails(db,
      `SELECT public.save_document('A', 'invoice', '{}'::jsonb, 'u', 'U')`))).toMatch(/not signed in to that branch/);
    expect(await as(db, 'anon', null, () => fails(db, `SELECT * FROM documents`))).toMatch(/permission denied/);
  });
});
