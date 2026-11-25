/** Executes 0048 on a real Postgres (see testdb.ts). */
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDb, as, fails } from './testdb';

const DEV_A = '11111111-1111-1111-1111-111111111111';
const DEV_B = '22222222-2222-2222-2222-222222222222';
let db: PGlite;
const claim = (dev = DEV_A, branch = 'A') => as(db, 'authenticated', dev, async () =>
  (await db.query<any>(`SELECT public.claim_print_jobs($1) AS r`, [branch])).rows[0].r);
const release = (items: string[], cancels: string[] = []) => as(db, 'authenticated', DEV_A, () =>
  db.query(`SELECT public.release_print_jobs('A', $1, $2)`, [items, cancels]));
// What the station does after a ticket printed (0049).
const confirm = (items: string[]) => as(db, 'authenticated', DEV_A, () =>
  db.query(`SELECT public.confirm_print_jobs('A', $1)`, [items]));

beforeAll(async () => {
  db = await makeDb();
  await db.exec(`
    INSERT INTO organizations(id, name) VALUES ('o', 'O');
    INSERT INTO branches(id, org_id, name) VALUES ('A', 'o', 'A'), ('B', 'o', 'B');
    INSERT INTO branch_logins(auth_uid, branch_id) VALUES ('${DEV_A}', 'A'), ('${DEV_B}', 'B');
    INSERT INTO products(id, name, category, price, branch_id, station) VALUES ('fish', 'Fish', 'Seafood', 20, 'A', 'kitchen'), ('tea', 'Tea', 'Drinks', 3, 'A', 'juice');
    INSERT INTO orders(id, table_number, status, order_type, branch_id, subtotal, tax, total)
      VALUES ('o1', 5, 'open', 'dine-in', 'A', 0, 0, 0), ('o2', 0, 'open', 'takeaway', 'A', 0, 0, 0);
    INSERT INTO order_items(id, order_id, product_id, product_name, quantity, price, subtotal, added_by, added_by_name, branch_id, station, status, created_at)
      VALUES ('i1', 'o1', 'fish', 'Fish', 2, 20, 40, 'w1', 'Ali', 'A', 'kitchen', 'pending', now() - interval '5 minutes'),
             ('i2', 'o1', 'tea',  'Tea',  1, 3,  3,  'w1', 'Ali', 'A', 'juice',   'pending', now() - interval '5 minutes');`);
}, 60000);

describe('0048 print station', () => {
  it('hands each new item to one station once, with the bill details', async () => {
    const r = await claim();
    expect(r.items.map((i: any) => i.id).sort()).toEqual(['i1', 'i2']);
    expect(r.items[0]).toMatchObject({ table_number: 5, order_type: 'dine-in', add_on: false, added_by_name: 'Ali' });
    expect((await claim()).items).toEqual([]);
    await confirm(['i1', 'i2']);
  });

  it('marks a later round on the same bill as ADD ON', async () => {
    await db.exec(`INSERT INTO order_items(id, order_id, product_id, product_name, quantity, price, subtotal, added_by, added_by_name, branch_id, station, status)
                   VALUES ('i3', 'o1', 'tea', 'Tea', 2, 3, 6, 'w1', 'Ali', 'A', 'juice', 'pending')`);
    const r = await claim();
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ id: 'i3', add_on: true });
  });

  it('gives back items a printer refused, so they print next time', async () => {
    await release(['i3']);
    expect((await claim()).items.map((i: any) => i.id)).toEqual(['i3']);
    await confirm(['i3']);
  });

  it('prints a cancel ticket once for a printed item, none for one never printed', async () => {
    await db.exec(`
      UPDATE order_items SET status = 'cancelled', cancelled_by_name = 'Omar', cancel_reason = 'Too slow', cancelled_at = now() WHERE id = 'i1';
      INSERT INTO order_items(id, order_id, product_id, product_name, quantity, price, subtotal, added_by, added_by_name, branch_id, station, status, cancelled_at)
        VALUES ('i4', 'o2', 'fish', 'Fish', 1, 20, 20, 'w1', 'Ali', 'A', 'kitchen', 'cancelled', now());`);
    const r = await claim();
    expect(r.cancels).toHaveLength(1);
    expect(r.cancels[0]).toMatchObject({ id: 'i1', by: 'Omar', reason: 'Too slow', table_number: 5 });
    expect(r.items).toEqual([]);                     // i4 is marked done, not printed
    expect(await claim()).toEqual({ items: [], cancels: [] });
  });

  it('does not reprint lines a device already printed offline', async () => {
    const id1 = 'item-00000000-0000-0000-0000-000000000001';
    const id2 = 'item-00000000-0000-0000-0000-000000000002';
    await as(db, 'authenticated', DEV_A, () => db.query(
      `SELECT * FROM public.submit_order_items('o2', 'A', 'w1', 'Mona', $1::jsonb)`,
      [JSON.stringify([{ product_id: 'fish', quantity: 1, client_id: id1, printed: true }, { product_id: 'tea', quantity: 1, client_id: id2 }])]));
    expect((await claim()).items.map((i: any) => i.id)).toEqual([id2]);
  });

  it('is limited to the device\'s own branch', async () => {
    expect(await as(db, 'authenticated', DEV_B, () => fails(db, `SELECT public.claim_print_jobs('A')`))).toMatch(/not signed in to that branch/);
    expect(await as(db, 'authenticated', DEV_B, () => fails(db, `SELECT public.release_print_jobs('A', '{i1}', '{}')`))).toMatch(/not signed in to that branch/);
  });
});
