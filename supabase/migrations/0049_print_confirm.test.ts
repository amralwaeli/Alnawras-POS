/** Executes 0049 on a real Postgres (see testdb.ts). */
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDb, as } from './testdb';

const DEV_A = '11111111-1111-1111-1111-111111111111';
let db: PGlite;
const call = (sql: string, params: any[] = []) => as(db, 'authenticated', DEV_A, async () => (await db.query<any>(sql, params)).rows[0]);
const claim = async () => (await call(`SELECT public.claim_print_jobs('A') AS r`)).r;
const row = async (id: string) => (await db.query<any>(`SELECT printed_at, print_error, print_claimed_at FROM order_items WHERE id = $1`, [id])).rows[0];

beforeAll(async () => {
  db = await makeDb();
  await db.exec(`
    INSERT INTO organizations(id, name) VALUES ('o', 'O');
    INSERT INTO branches(id, org_id, name) VALUES ('A', 'o', 'A');
    INSERT INTO branch_logins(auth_uid, branch_id) VALUES ('${DEV_A}', 'A');
    INSERT INTO products(id, name, category, price, branch_id) VALUES ('fish', 'Fish', 'Seafood', 20, 'A');
    INSERT INTO orders(id, table_number, status, order_type, branch_id, subtotal, tax, total) VALUES ('o1', 5, 'open', 'dine-in', 'A', 0, 0, 0);
    INSERT INTO order_items(id, order_id, product_id, product_name, quantity, price, subtotal, added_by, added_by_name, branch_id, station, status)
      VALUES ('i1', 'o1', 'fish', 'Fish', 1, 20, 20, 'w1', 'Ali', 'A', 'kitchen', 'pending'),
             ('i2', 'o1', 'fish', 'Fish', 1, 20, 20, 'w1', 'Ali', 'A', 'kitchen', 'pending');`);
}, 60000);

describe('0049 print confirm', () => {
  it('counts an item as printed only once the station confirms it', async () => {
    expect((await claim()).items).toHaveLength(2);
    expect((await row('i1')).printed_at).toBeNull();          // being printed, not printed
    expect((await claim()).items).toEqual([]);                // leased: no second station prints it
    await call(`SELECT public.confirm_print_jobs('A', '{i1}')`);
    expect((await row('i1')).printed_at).not.toBeNull();
  });

  it('records why a ticket did not print, and Send again retries it at once', async () => {
    await call(`SELECT public.release_print_jobs('A', '{i2}', '{}', 'Kitchen printer not reachable')`);
    expect(await row('i2')).toMatchObject({ printed_at: null, print_error: 'Kitchen printer not reachable', print_claimed_at: null });
    expect((await claim()).items.map((i: any) => i.id)).toEqual(['i2']);   // the error stays until it prints
    expect((await row('i2')).print_error).toBe('Kitchen printer not reachable');
    await call(`SELECT public.release_print_jobs('A', '{i2}', '{}')`);    // the waiter's Send again
    expect((await row('i2')).print_error).toBeNull();
    expect((await claim()).items.map((i: any) => i.id)).toEqual(['i2']);
    await call(`SELECT public.confirm_print_jobs('A', '{i2}')`);
    expect(await row('i2')).toMatchObject({ print_error: null, print_claimed_at: null });
  });

  it('sends no cancel ticket for an item that never printed', async () => {
    await db.exec(`INSERT INTO order_items(id, order_id, product_id, product_name, quantity, price, subtotal, added_by, added_by_name, branch_id, station, status)
                   VALUES ('i3', 'o1', 'fish', 'Fish', 1, 20, 20, 'w1', 'Ali', 'A', 'kitchen', 'pending')`);
    await claim();
    await call(`SELECT public.release_print_jobs('A', '{i3}', '{}', 'off')`);
    await db.exec(`UPDATE order_items SET status = 'cancelled', cancelled_at = now() WHERE id = 'i3'`);
    expect(await claim()).toEqual({ items: [], cancels: [] });
    expect((await row('i3')).printed_at).not.toBeNull();     // closed, nothing left to print
  });
});
