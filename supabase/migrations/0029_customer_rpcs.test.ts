/**
 * Executes 0029 on a real Postgres (see testdb.ts) and checks the customer
 * functions enforce on the server what the pages used to enforce in JavaScript.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDb, as, one, fails } from './testdb';

const T1 = 'a'.repeat(64);      // table 1 QR token (branch b1)
const T2 = 'b'.repeat(64);      // table 2 QR token (branch b1), ordering off
const TX = 'c'.repeat(64);      // table in branch b2
const PK = 'd'.repeat(64);      // pickup token (b1)
const PK_OLD = 'e'.repeat(64);  // expired pickup token
const RECEIPT = 'https://x.supabase.co/storage/v1/object/public/pickup-receipts/r.png';

let db: PGlite;
const anon = <R>(fn: () => Promise<R>) => as(db, 'anon', null, fn);
const join = async (qr: string, s: string | null = null) => {
  const r = await anon(() => one<any>(db, 'SELECT public.guest_join($1, $2)', [qr, s]));
  // keep the 10-joins-per-minute limit out of the functional tests (tested on its own below)
  await db.exec(`UPDATE guest_sessions SET created_at = created_at - interval '2 minutes'`);
  return r;
};
const submit = (s: string, items: any[]) =>
  anon(() => one<any>(db, 'SELECT public.guest_submit($1, $2::jsonb)', [s, JSON.stringify(items)]));
const submitErr = (s: string, items: any[]) =>
  anon(() => fails(db, 'SELECT public.guest_submit($1, $2::jsonb)', [s, JSON.stringify(items)]));
const state = (s: string) => anon(() => one<any>(db, 'SELECT public.guest_state($1)', [s]));
const pickup = (tok: string, details: any, items: any[]) =>
  anon(() => fails(db, 'SELECT public.pickup_submit($1, $2::jsonb, $3::jsonb)', [tok, JSON.stringify(details), JSON.stringify(items)]));
const okDetails = { customerName: 'Ali', customerPhone: '+60 12-345 6789', method: 'self', payType: 'cash' };

beforeAll(async () => {
  db = await makeDb();
  await db.exec(`
    INSERT INTO organizations(id, name) VALUES ('o1', 'Org');
    INSERT INTO branches(id, org_id, name) VALUES ('b1', 'o1', 'One'), ('b2', 'o1', 'Two');
    INSERT INTO tables(id, number, capacity, branch_id, qr_token, ordering_enabled) VALUES
      ('t1', 1, 4, 'b1', '${T1}', true), ('t2', 2, 4, 'b1', '${T2}', false), ('tx', 1, 4, 'b2', '${TX}', true);
    INSERT INTO products(id, name, category, price, branch_id, kitchen_status) VALUES
      ('p1', 'Mandi', 'Mains', 20, 'b1', 'available'),
      ('p2', 'Soup', 'Mains', 5, 'b1', 'finished'),
      ('px', 'Other', 'Mains', 9, 'b2', 'available');
    INSERT INTO modifier_groups(id, name, branch_id) VALUES ('g1', 'Size', 'b1'), ('g2', 'Unlinked', 'b1');
    INSERT INTO modifier_options(id, group_id, name, add_on_price) VALUES ('large', 'g1', 'Large', 4), ('free', 'g2', 'Free', 0);
    INSERT INTO product_modifier_groups(product_id, group_id) VALUES ('p1', 'g1');
    INSERT INTO pickup_tokens(id, token, branch_id, status, active, expires_at) VALUES
      ('pk1', '${PK}', 'b1', 'new', true, NOW() + interval '1 day'),
      ('pk2', '${PK_OLD}', 'b1', 'new', true, NOW() - interval '1 hour');
    INSERT INTO storage.objects(bucket_id, name) VALUES ('pickup-receipts', 'r.png');
    INSERT INTO branch_settings(branch_id, tax_enabled, tax_rate) VALUES ('b1', true, 6);
  `);
}, 60000);

describe('guest_join', () => {
  it('rejects an unknown or malformed token', async () => {
    expect(await join('f'.repeat(64))).toBeNull();
    expect(await join('short')).toBeNull();
  });

  it('gives a new guest token and resumes a saved one', async () => {
    const a = await join(T1);
    expect(a.session_token).toHaveLength(64);
    expect(a.guest_label).toBe('Guest 1');
    const again = await join(T1, a.session_token);
    expect(again.session_token).toBe(a.session_token);
    const b = await join(T1);
    expect(b.guest_label).toBe('Guest 2');
  });

  it('does not resume a token from another table', async () => {
    const a = await join(T1);
    const other = await join(TX, a.session_token);
    expect(other.session_token).not.toBe(a.session_token);
  });
});

describe('guest_submit', () => {
  it('refuses while ordering is off for the table', async () => {
    const g = await join(T2);
    expect(await submitErr(g.session_token, [{ product_id: 'p1', quantity: 1 }])).toMatch(/not switched on/);
  });

  it('prices from the database and puts the whole party on one bill', async () => {
    const a = await join(T1);
    const b = await join(T1);
    const s1 = await submit(a.session_token, [{ product_id: 'p1', quantity: 2, price: 0.01, option_ids: ['large'] }]);
    const s2 = await submit(b.session_token, [{ product_id: 'p1', quantity: 1 }]);
    expect(s1.order_id).toBeTruthy();
    expect(s2.order_id).toBe(s1.order_id);
    expect(s1.items[0].price).toBe(24);                       // 20 + 4 add-on, not the client's 0.01
    expect(Number(await one(db, `SELECT total FROM orders WHERE id = $1`, [s1.order_id]))).toBe(68);
    expect(await one(db, `SELECT current_order_id FROM tables WHERE id = 't1'`)).toBe(s1.order_id);
  });

  it.each([
    ['quantity 0', [{ product_id: 'p1', quantity: 0 }], /between 1 and 99/],
    ['quantity 100', [{ product_id: 'p1', quantity: 100 }], /between 1 and 99/],
    ['a sold-out dish', [{ product_id: 'p2', quantity: 1 }], /not available/],
    ["another branch's dish", [{ product_id: 'px', quantity: 1 }], /not on the menu/],
    ['an option not offered for the dish', [{ product_id: 'p1', quantity: 1, option_ids: ['free'] }], /not offered/],
    ['an empty order', [], /No items/],
  ])('rejects %s', async (_n, items, msg) => {
    const g = await join(T1);
    expect(await submitErr(g.session_token, items as any[])).toMatch(msg as RegExp);
  });

  it('joins the bill a waiter already opened at the table', async () => {
    await db.exec(`
      INSERT INTO tables(id, number, capacity, branch_id, qr_token, ordering_enabled, current_order_id)
        VALUES ('t3', 3, 2, 'b1', '${'9'.repeat(64)}', true, NULL);
      INSERT INTO orders(id, table_id, table_number, status, branch_id) VALUES ('staff-order', 't3', 3, 'open', 'b1');
      UPDATE tables SET current_order_id = 'staff-order' WHERE id = 't3';`);
    const g = await join('9'.repeat(64));
    const s = await submit(g.session_token, [{ product_id: 'p1', quantity: 1 }]);
    expect(s.order_id).toBe('staff-order');
  });

  it('stops working once the party is closed (bill paid)', async () => {
    const g = await join(TX);
    expect(await state(g.session_token)).not.toBeNull();
    await db.exec(`UPDATE order_groups SET status = 'closed' WHERE table_id = 'tx'`);
    expect(await state(g.session_token)).toBeNull();
    expect(await submitErr(g.session_token, [{ product_id: 'px', quantity: 1 }])).toMatch(/session has ended/);
  });

  it('refuses when the branch is suspended', async () => {
    const g = await join(T1);
    await db.exec(`UPDATE branches SET status = 'suspended' WHERE id = 'b1'`);
    try {
      expect(await submitErr(g.session_token, [{ product_id: 'p1', quantity: 1 }])).toMatch(/not available/);
      expect((await join(T1)).closed).toBe(true);
    } finally {
      await db.exec(`UPDATE branches SET status = 'active' WHERE id = 'b1'`);
    }
  });
});

describe('guest_state and guest_call_waiter', () => {
  it('reports flags, the bill and sold-out dishes', async () => {
    const g = await join(T1);
    const s = await state(g.session_token);
    expect(s.table_number).toBe(1);
    expect(s.ordering_enabled).toBe(true);
    expect(s.unavailable_product_ids).toEqual(['p2']);
    expect(s.items.length).toBeGreaterThan(0);
  });

  it('calls a waiter for the guest\'s own table only', async () => {
    const g = await join(T2);
    expect(await anon(() => one(db, 'SELECT public.guest_call_waiter($1)', [g.session_token]))).toBe(true);
    expect(await one(db, `SELECT needs_waiter FROM tables WHERE id = 't2'`)).toBe(true);
    expect(await anon(() => one(db, 'SELECT public.guest_call_waiter($1)', ['0'.repeat(64)]))).toBe(false);
  });
});

describe('pickup', () => {
  it('opens a live link and refuses an expired one', async () => {
    const o = await anon(() => one<any>(db, 'SELECT public.pickup_open($1)', [PK]));
    expect(o.branch_id).toBe('b1');
    expect(o.tax).toMatchObject({ enabled: true, rate: 6, inclusive: false });   // the page shows the same tax as the till
    expect(await anon(() => one(db, 'SELECT public.pickup_open($1)', [PK_OLD]))).toBeNull();
  });

  it.each([
    ['a bad phone', { ...okDetails, customerPhone: 'call me' }, /phone/],
    ['online without a receipt', { ...okDetails, payType: 'online' }, /receipt/],
    ['a receipt from elsewhere', { ...okDetails, payType: 'online', receiptUrl: 'https://evil.example/x.png' }, /Invalid receipt/],
    ['a look-alike receipt URL', { ...okDetails, payType: 'online', receiptUrl: 'https://evil.example/x/storage/v1/object/public/pickup-receipts/r.png' }, /Invalid receipt/],
    ['a receipt that was never uploaded', { ...okDetails, payType: 'online', receiptUrl: 'https://x.supabase.co/storage/v1/object/public/pickup-receipts/nope.png' }, /Invalid receipt/],
    ['an unknown method', { ...okDetails, method: 'drone' }, /pickup method/],
  ])('rejects %s', async (_n, details, msg) => {
    expect(await pickup(PK, details, [{ product_id: 'p1', quantity: 1 }])).toMatch(msg as RegExp);
  });

  it('places exactly one order per link, priced by the server', async () => {
    expect(await pickup(PK, { ...okDetails, payType: 'online', receiptUrl: RECEIPT }, [{ product_id: 'p1', quantity: 2, price: 1 }])).toBeNull();
    const o = await db.query<any>(`SELECT o.total, o.payment_status, o.bill_number FROM orders o
      JOIN pickup_tokens t ON t.order_id = o.id WHERE t.token = $1`, [PK]);
    expect(Number(o.rows[0].total)).toBe(40);
    expect(o.rows[0].payment_status).toBe('pending_verification');
    expect(o.rows[0].bill_number).toMatch(/^\d{4}$/);
    expect(await pickup(PK, okDetails, [{ product_id: 'p1', quantity: 1 }])).toMatch(/already been placed/);
  });
});

describe('abuse limits and closing', () => {
  it("closes the party (and old guests' tokens) whichever way the bill is closed", async () => {
    await db.exec(`INSERT INTO tables(id, number, capacity, branch_id, qr_token, ordering_enabled)
                   VALUES ('t5', 5, 4, 'b1', '${'5'.repeat(64)}', true)`);
    const old = await join('5'.repeat(64));
    const s = await submit(old.session_token, [{ product_id: 'p1', quantity: 1 }]);
    // whole-bill payment path: a plain status update, not pay_order_items
    await db.exec(`UPDATE orders SET status = 'completed' WHERE id = '${s.order_id}'`);
    expect(await state(old.session_token)).toBeNull();
    expect(await submitErr(old.session_token, [{ product_id: 'p1', quantity: 1 }])).toMatch(/session has ended/);
    const next = await join('5'.repeat(64));
    expect(next.guest_label).toBe('Guest 1');                       // a fresh party
  });

  it('refuses more than 10 new guests per table per minute', async () => {
    await db.exec(`INSERT INTO tables(id, number, capacity, branch_id, qr_token) VALUES ('t6', 6, 4, 'b1', '${'6'.repeat(64)}')`);
    for (let i = 0; i < 10; i++) await anon(() => one(db, 'SELECT public.guest_join($1)', ['6'.repeat(64)]));
    expect(await anon(() => fails(db, 'SELECT public.guest_join($1)', ['6'.repeat(64)]))).toMatch(/Too many people/);
  });

  it('stops at 30 guests per party', async () => {
    await db.exec(`INSERT INTO tables(id, number, capacity, branch_id, qr_token) VALUES ('t7', 7, 4, 'b1', '${'7'.repeat(64)}')`);
    for (let i = 0; i < 30; i++) await join('7'.repeat(64));
    expect((await join('7'.repeat(64))).full).toBe(true);
  });

  it('limits one guest to 40 lines a minute', async () => {
    const g = await join(T1);
    const forty = Array.from({ length: 40 }, () => ({ product_id: 'p1', quantity: 1 }));
    expect(await submitErr(g.session_token, forty)).toBeNull();
    expect(await submitErr(g.session_token, [{ product_id: 'p1', quantity: 1 }])).toMatch(/wait a moment/);
  });
});

describe('internals stay private', () => {
  it('anon cannot call the item-insertion function directly', async () => {
    expect(await anon(() => fails(db, `SELECT * FROM public._add_order_items('x','b1','a','a','[]'::jsonb)`))).toMatch(/permission denied/);
  });

  it('the staff path (submit_order_items) still prices and inserts', async () => {
    const dev = '44444444-4444-4444-4444-444444444444';     // staff calls need a branch device (0031)
    await db.exec(`INSERT INTO orders(id, table_number, status, branch_id) VALUES ('so', 0, 'open', 'b1');
                   INSERT INTO branch_logins(auth_uid, branch_id) VALUES ('${dev}', 'b1');`);
    const r = await as(db, 'authenticated', dev, () => db.query<any>(
      `SELECT * FROM public.submit_order_items('so', 'b1', 'u1', 'Waiter', $1::jsonb)`,
      [JSON.stringify([{ product_id: 'p1', quantity: 1, option_ids: ['large'] }])]));
    expect(Number(r.rows[0].price)).toBe(24);
  });
});
