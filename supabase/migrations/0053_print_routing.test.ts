/** Executes 0053 on a real Postgres (see testdb.ts). */
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDb, as } from './testdb';

const DEV_A = '11111111-1111-1111-1111-111111111111';
let db: PGlite;

beforeAll(async () => {
  db = await makeDb();
  await db.exec(`
    INSERT INTO organizations(id, name) VALUES ('o', 'O');
    INSERT INTO branches(id, org_id, name) VALUES ('A', 'o', 'A');
    INSERT INTO branch_logins(auth_uid, branch_id) VALUES ('${DEV_A}', 'A');
    INSERT INTO products(id, name, category, price, branch_id, station, also_stations)
      VALUES ('plate', 'Shawarma Plate', 'Shawarma', 16, 'A', 'shawarma', '{kitchen}'),
             ('family', 'Family Maqluba', 'Family', 100, 'A', 'kitchen', '{}');
    INSERT INTO modifier_groups(id, name, type, branch_id) VALUES ('g', 'Free drink', 'single', 'A');
    INSERT INTO modifier_options(id, group_id, name, add_on_price, station) VALUES ('lemon', 'g', 'Lemon Juice', 0, 'juice'), ('plain', 'g', 'None', 0, NULL);
    INSERT INTO product_modifier_groups(product_id, group_id) VALUES ('family', 'g');
    INSERT INTO orders(id, table_number, status, order_type, branch_id, subtotal, tax, total) VALUES ('o1', 30, 'open', 'dine-in', 'A', 0, 0, 0);`);
  await as(db, 'authenticated', DEV_A, () => db.query(
    `SELECT * FROM public.submit_order_items('o1', 'A', 'w1', 'Hameed', $1::jsonb)`,
    [JSON.stringify([{ product_id: 'plate', quantity: 1 }, { product_id: 'family', quantity: 1, option_ids: ['lemon'] }])]));
}, 60000);

describe('0053 print routing', () => {
  it('tells the station where else each item and choice prints', async () => {
    const r = await as(db, 'authenticated', DEV_A, async () => (await db.query<any>(`SELECT public.claim_print_jobs('A') AS r`)).rows[0].r);
    const plate = r.items.find((i: any) => i.product_name === 'Shawarma Plate');
    const family = r.items.find((i: any) => i.product_name === 'Family Maqluba');
    expect(plate).toMatchObject({ station: 'shawarma', also: ['kitchen'], option_stations: null });
    expect(family).toMatchObject({ station: 'kitchen', also: [], option_stations: { lemon: 'juice' } });
  });
});
