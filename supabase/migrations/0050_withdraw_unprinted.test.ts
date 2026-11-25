/** Executes 0050 on a real Postgres (see testdb.ts). */
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDb, as, fails } from './testdb';

const DEV_A = '11111111-1111-1111-1111-111111111111';
const DEV_B = '22222222-2222-2222-2222-222222222222';
let db: PGlite;
const call = (sql: string, params: any[] = []) => as(db, 'authenticated', DEV_A, async () => (await db.query<any>(sql, params)).rows[0]);
const withdraw = async (order: string, ids: string[], dropEmpty = false) =>
  (await call(`SELECT public.withdraw_unprinted_items('A', $1, $2, $3) AS r`, [order, ids, dropEmpty])).r;
const q = async (sql: string) => (await db.query<any>(sql)).rows;
const item = (id: string, order: string, extra = '') =>
  `INSERT INTO order_items(id, order_id, product_id, product_name, quantity, price, subtotal, added_by, added_by_name, branch_id, station, status${extra ? ', ' + extra.split('=')[0] : ''})
   VALUES ('${id}', '${order}', 'fish', 'Fish', 1, 20, 20, 'w1', 'Ali', 'A', 'kitchen', 'pending'${extra ? ', ' + extra.split('=')[1] : ''});`;

beforeAll(async () => {
  db = await makeDb();
  await db.exec(`
    INSERT INTO organizations(id, name) VALUES ('o', 'O');
    INSERT INTO branches(id, org_id, name) VALUES ('A', 'o', 'A'), ('B', 'o', 'B');
    INSERT INTO branch_logins(auth_uid, branch_id) VALUES ('${DEV_A}', 'A'), ('${DEV_B}', 'B');
    INSERT INTO products(id, name, category, price, branch_id) VALUES ('fish', 'Fish', 'Seafood', 20, 'A');
    INSERT INTO orders(id, table_number, status, order_type, branch_id, subtotal, tax, total)
      VALUES ('o1', 5, 'open', 'dine-in', 'A', 60, 0, 60), ('o2', 6, 'open', 'dine-in', 'A', 20, 0, 20);
    INSERT INTO tables(id, number, capacity, branch_id, status, current_order_id) VALUES ('t6', 6, 4, 'A', 'occupied', 'o2');
    ${item('p1', 'o1', 'printed_at=now()')}
    ${item('u1', 'o1')}
    ${item('c1', 'o1', 'print_claimed_at=now()')}
    ${item('u2', 'o2')}`);
}, 60000);

describe('0050 withdraw unprinted items', () => {
  it('takes items that did not print off the bill and fixes the total', async () => {
    const r = await withdraw('o1', ['p1', 'u1', 'c1']);
    expect(r.removed).toEqual(['u1']);              // p1 printed, c1 is printing right now
    expect(r.bill_dropped).toBe(false);
    expect((await q(`SELECT id FROM order_items WHERE order_id = 'o1' ORDER BY id`)).map(x => x.id)).toEqual(['c1', 'p1']);
    expect(Number((await q(`SELECT total FROM orders WHERE id = 'o1'`))[0].total)).toBe(40);
  });

  it('takes off an item whose print failed', async () => {
    await call(`SELECT public.release_print_jobs('A', '{c1}', '{}', 'Kitchen printer did not print')`);
    expect((await withdraw('o1', ['c1'])).removed).toEqual(['c1']);
  });

  it('drops a bill this send created once it is empty, and frees the table', async () => {
    const r = await withdraw('o2', ['u2'], true);
    expect(r).toEqual({ removed: ['u2'], bill_dropped: true });
    expect(await q(`SELECT id FROM orders WHERE id = 'o2'`)).toEqual([]);
    expect((await q(`SELECT status, current_order_id FROM tables WHERE id = 't6'`))[0]).toEqual({ status: 'available', current_order_id: null });
  });

  it('keeps an empty bill it did not create (e.g. a group QR order)', async () => {
    await db.exec(`INSERT INTO orders(id, table_number, status, order_type, branch_id, subtotal, tax, total) VALUES ('o3', 7, 'open', 'dine-in', 'A', 20, 0, 20);
                   ${item('u3', 'o3')}`);
    expect((await withdraw('o3', ['u3'])).bill_dropped).toBe(false);
    expect(await q(`SELECT id FROM orders WHERE id = 'o3'`)).toHaveLength(1);
  });

  it('waits 15 seconds before the station retries a failed ticket', async () => {
    await db.exec(item('u4', 'o3'));
    await call(`SELECT public.claim_print_jobs('A')`);
    await call(`SELECT public.release_print_jobs('A', '{u4}', '{}', 'off')`);
    expect((await call(`SELECT public.claim_print_jobs('A') AS r`)).r.items).toEqual([]);
    await db.exec(`UPDATE order_items SET print_claimed_at = now() - interval '20 seconds' WHERE id = 'u4'`);
    expect((await call(`SELECT public.claim_print_jobs('A') AS r`)).r.items.map((i: any) => i.id)).toEqual(['u4']);
  });

  it('is limited to the device\'s own branch', async () => {
    expect(await as(db, 'authenticated', DEV_B, () => fails(db, `SELECT public.withdraw_unprinted_items('A', 'o1', '{p1}')`)))
      .toMatch(/not signed in to that branch/);
  });
});
