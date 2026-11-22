/**
 * The isolation test for the whole cutover: executes every migration on a real
 * Postgres (see testdb.ts) and checks, for EVERY table in the schema, what an
 * anonymous visitor, branch A's device, branch B's device and a stray signed-in
 * account can see and change.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDb, as, one, fails } from './testdb';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEV_A = '11111111-1111-1111-1111-111111111111';
const DEV_B = '22222222-2222-2222-2222-222222222222';
const STRAY = '33333333-3333-3333-3333-333333333333';   // e.g. a self-signed-up account
const SA    = '44444444-4444-4444-4444-444444444444';   // super-admin

// Tables anonymous visitors may read (menus + branch registry).
const PUBLIC_READ = new Set(['products', 'categories', 'modifier_groups', 'modifier_options', 'product_modifier_groups', 'branches',
  'smartpos_license']);   // 0045: a signed licence, not secret
// Tables with no direct API access at all (functions / service role only).
const FUNCTIONS_ONLY = new Set(['bill_counters', 'pin_attempts', 'tenant_invites', 'super_admins', 'branch_logins']);

let db: PGlite;
let tables: string[] = [];

const seed = (b: string, n: number) => `
  INSERT INTO users(id, name, employment_number, role, pin, email, branch_id) VALUES ('u${b}', 'U', 'E${b}', 'waiter', '${1000 + n}', 'u${b}@x', '${b}');
  INSERT INTO categories(id, name, branch_id) VALUES ('c${b}', 'C', '${b}');
  INSERT INTO products(id, name, category, price, branch_id) VALUES ('p${b}', 'P', 'C', 5, '${b}');
  INSERT INTO tables(id, number, capacity, branch_id) VALUES ('t${b}', 1, 4, '${b}');
  INSERT INTO orders(id, table_number, status, branch_id) VALUES ('o${b}', 1, 'open', '${b}');
  INSERT INTO order_items(id, order_id, product_id, product_name, quantity, price, subtotal, added_by, added_by_name, branch_id)
    VALUES ('i${b}', 'o${b}', 'p${b}', 'P', 1, 5, 5, 'u', 'U', '${b}');
  INSERT INTO expenses(id, branch_id, description, amount, created_by, created_by_name) VALUES ('x${b}', '${b}', 'd', 1, 'u', 'U');
  INSERT INTO customers(name, phone, branch_id) VALUES ('C', '1', '${b}');
  INSERT INTO employees(id, employee_id, full_name, role, branch_id, employee_number) VALUES ('e${b}', 'EMP-${b}', 'E', 'waiter', '${b}', 'EMP-${b}');
  INSERT INTO employee_fingerprints(id, employee_id, template_data, template_hash, finger_index, branch_id) VALUES ('f${b}', 'EMP-${b}', 'x', 'h', 1, '${b}');
  INSERT INTO modifier_groups(id, name, branch_id) VALUES ('g${b}', 'G', '${b}');
  INSERT INTO modifier_options(id, group_id, name) VALUES ('mo${b}', 'g${b}', 'O');
  INSERT INTO product_modifier_groups(product_id, group_id) VALUES ('p${b}', 'g${b}');
  INSERT INTO branch_settings(branch_id) VALUES ('${b}');
  INSERT INTO shifts(user_id, branch_id) VALUES ('u${b}', '${b}');`;

beforeAll(async () => {
  db = await makeDb();
  await db.exec(`
    INSERT INTO organizations(id, name) VALUES ('o', 'O');
    INSERT INTO branches(id, org_id, name) VALUES ('A', 'o', 'A'), ('B', 'o', 'B');
    INSERT INTO branch_logins(auth_uid, branch_id) VALUES ('${DEV_A}', 'A'), ('${DEV_B}', 'B');
    INSERT INTO super_admins(auth_uid) VALUES ('${SA}');
    ${seed('A', 1)} ${seed('B', 2)}
    INSERT INTO products(id, name, category, price, branch_id, is_active) VALUES ('hidden', 'Old', 'C', 1, 'A', false);`);
  tables = (await db.query<any>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`)).rows.map(r => r.tablename);
}, 60000);

const count = (t: string) => one<number>(db, `SELECT count(*)::int FROM public.${t}`);
const hasBranchId = (t: string) =>
  one<number>(db, `SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name='branch_id'`, [t]);

describe('every table has RLS on', () => {
  it('no public table is left open', async () => {
    const open = (await db.query<any>(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity`)).rows;
    expect(open.map(r => r.tablename)).toEqual([]);
  });
});

describe('anonymous visitor', () => {
  it('cannot read any table except menus and the branch registry', async () => {
    for (const t of tables) {
      const err = await as(db, 'anon', null, () => fails(db, `SELECT 1 FROM public.${t} LIMIT 1`));
      if (PUBLIC_READ.has(t)) expect(err, t).toBeNull();
      else expect(err, t).toMatch(/permission denied/);
    }
  });

  it('sees active dishes only', async () => {
    const ids = await as(db, 'anon', null, () => db.query<any>(`SELECT id FROM products ORDER BY id`));
    expect(ids.rows.map(r => r.id)).toEqual(['pA', 'pB']);
  });

  it('cannot change anything directly', async () => {
    for (const t of tables) {
      const err = await as(db, 'anon', null, () => fails(db, `DELETE FROM public.${t}`));
      expect(err, t).toMatch(/permission denied/);
    }
  });
});

describe("a branch device sees only its own branch", () => {
  it.each([['A', DEV_A], ['B', DEV_B]])('branch %s', async (b, dev) => {
    await as(db, 'authenticated', dev, async () => {
      for (const t of tables) {
        if (FUNCTIONS_ONLY.has(t)) {
          expect(await fails(db, `SELECT 1 FROM public.${t}`), t).toMatch(/permission denied/);
          continue;
        }
        if (t === 'organizations') { expect(await count(t), t).toBe(0); continue; }
        if (t === 'branches') { continue; }                                   // registry readable by design (0028)
        if (t === 'users') {
          const r = await db.query<any>(`SELECT DISTINCT branch_id FROM users`);
          expect(r.rows.map(x => x.branch_id), t).toEqual([b]);
          continue;
        }
        if (await hasBranchId(t)) {
          const r = await db.query<any>(`SELECT DISTINCT branch_id FROM public.${t}`);
          for (const row of r.rows) expect(row.branch_id, t).toBe(b);
        }
      }
      // child tables without branch_id
      expect((await db.query<any>(`SELECT id FROM modifier_options`)).rows.map(r => r.id)).toEqual([`mo${b}`]);
      expect((await db.query<any>(`SELECT product_id FROM product_modifier_groups`)).rows.map(r => r.product_id)).toEqual([`p${b}`]);
      expect((await db.query<any>(`SELECT id FROM employee_fingerprints`)).rows.map(r => r.id)).toEqual([`f${b}`]);
    });
  });

  it("cannot write into, change or delete another branch's rows", async () => {
    await as(db, 'authenticated', DEV_A, async () => {
      expect(await fails(db, `INSERT INTO expenses(id, branch_id, description, amount, created_by, created_by_name) VALUES ('evil', 'B', 'd', 1, 'u', 'U')`))
        .toMatch(/row-level security/);
      await db.query(`UPDATE orders SET total = 999 WHERE id = 'oB'`);
      await db.query(`DELETE FROM customers WHERE branch_id = 'B'`);
      await db.query(`UPDATE orders SET branch_id = 'B' WHERE id = 'oA'`).catch(() => null);   // moving a row out is refused too
    });
    expect(Number(await one(db, `SELECT total FROM orders WHERE id = 'oB'`))).toBe(0);
    expect(await one(db, `SELECT count(*)::int FROM customers WHERE branch_id = 'B'`)).toBe(1);
    expect(await one(db, `SELECT branch_id FROM orders WHERE id = 'oA'`)).toBe('A');
  });

  it('can still do its own day-to-day writes', async () => {
    await as(db, 'authenticated', DEV_A, async () => {
      expect(await fails(db, `INSERT INTO expenses(id, branch_id, description, amount, created_by, created_by_name) VALUES ('ok', 'A', 'd', 1, 'u', 'U')`)).toBeNull();
      expect(await fails(db, `UPDATE tables SET ordering_enabled = true WHERE id = 'tA'`)).toBeNull();
      expect(await fails(db, `INSERT INTO modifier_options(id, group_id, name) VALUES ('mo2', 'gA', 'X')`)).toBeNull();
      expect(await fails(db, `INSERT INTO modifier_options(id, group_id, name) VALUES ('mo3', 'gB', 'X')`)).toMatch(/row-level security/);
    });
  });
});

describe("the security review's attacks", () => {
  it("cannot plant a line on another branch's bill (linked-row check)", async () => {
    const err = await as(db, 'authenticated', DEV_A, () => fails(db,
      `INSERT INTO order_items(id, order_id, product_id, product_name, quantity, price, subtotal, added_by, added_by_name, branch_id)
       VALUES ('plant', 'oB', 'pA', 'FAKE', 1, 1000, 1000, 'u', 'U', 'A')`));
    expect(err).toMatch(/row-level security/);
  });

  it('cannot squat another branch\'s table with a party', async () => {
    const err = await as(db, 'authenticated', DEV_A, () => fails(db,
      `INSERT INTO order_groups(id, table_id, branch_id, status) VALUES ('squat', 'tB', 'A', 'active')`));
    expect(err).toMatch(/row-level security/);
  });

  it('cannot write payment or loyalty history, or edit the audit log', async () => {
    await as(db, 'authenticated', DEV_A, async () => {
      expect(await fails(db, `INSERT INTO order_payments(id, order_id, amount, method, branch_id) VALUES ('fake', 'oA', 1, 'cash', 'A')`)).toMatch(/row-level security/);
      expect(await fails(db, `INSERT INTO audit_logs(id, action, branch_id) VALUES ('a1', 'test', 'A')`)).toBeNull();   // append is fine
      await db.query(`UPDATE audit_logs SET action = 'edited' WHERE id = 'a1'`);
      await db.query(`DELETE FROM audit_logs WHERE id = 'a1'`);
    });
    expect(await one(db, `SELECT action FROM audit_logs WHERE id = 'a1'`)).toBe('test');
  });

  it('cannot change or delete a paid bill', async () => {
    await db.exec(`INSERT INTO orders(id, table_number, status, branch_id, total) VALUES ('paid', 1, 'completed', 'A', 50)`);
    await as(db, 'authenticated', DEV_A, async () => {
      await db.query(`UPDATE orders SET total = 1 WHERE id = 'paid'`);
      await db.query(`DELETE FROM orders WHERE id = 'paid'`);
    });
    expect(Number(await one(db, `SELECT total FROM orders WHERE id = 'paid'`))).toBe(50);
  });

  it('storage: nobody can list receipts; customers can upload one', async () => {
    await db.exec(`INSERT INTO storage.objects(bucket_id, name) VALUES ('pickup-receipts', 'someone-else.png')`);
    const listed = await as(db, 'anon', null, () => db.query<any>(`SELECT name FROM storage.objects WHERE bucket_id = 'pickup-receipts'`));
    expect(listed.rows).toEqual([]);
    expect(await as(db, 'anon', null, () => fails(db, `INSERT INTO storage.objects(bucket_id, name) VALUES ('pickup-receipts', 'mine.png')`))).toBeNull();
  });

  it("storage: a branch can only upload its own payment QR and its own menu photos", async () => {
    await as(db, 'authenticated', DEV_A, async () => {
      expect(await fails(db, `INSERT INTO storage.objects(bucket_id, name) VALUES ('merchant-qr', 'A.png')`)).toBeNull();
      expect(await fails(db, `INSERT INTO storage.objects(bucket_id, name) VALUES ('merchant-qr', 'B.png')`)).toMatch(/row-level security/);
      expect(await fails(db, `INSERT INTO storage.objects(bucket_id, name) VALUES ('product-images', 'A/x.jpg')`)).toBeNull();
      expect(await fails(db, `INSERT INTO storage.objects(bucket_id, name) VALUES ('product-images', 'B/x.jpg')`)).toMatch(/row-level security/);
    });
    expect(await as(db, 'anon', null, () => fails(db, `INSERT INTO storage.objects(bucket_id, name) VALUES ('merchant-qr', 'A.png')`))).toMatch(/row-level security/);
  });
});

describe('tables no migration knows about', () => {
  it('a hand-made table is locked by default; printers / shift_rules get branch policies', async () => {
    const fresh = await makeDb('0031_money_rpcs_branch_check.sql');
    await fresh.exec(`
      CREATE TABLE public.handmade (id text);
      CREATE TABLE public.printers (id text PRIMARY KEY, name text, branch_id text);
      CREATE TABLE public.shift_rules (id text PRIMARY KEY, employee_id text);
      CREATE PUBLICATION supabase_realtime FOR TABLE public.users, public.orders;`);
    await fresh.exec(readFileSync(fileURLToPath(new URL('./0032_enable_rls.sql', import.meta.url)), 'utf8'));
    const open = (await fresh.query<any>(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity`)).rows;
    expect(open).toEqual([]);
    const pols = (await fresh.query<any>(`SELECT tablename FROM pg_policies WHERE tablename IN ('printers','shift_rules','handmade') ORDER BY 1`)).rows;
    expect(pols.map(r => r.tablename)).toEqual(['printers', 'shift_rules']);
    const pub = (await fresh.query<any>(`SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY 1`)).rows;
    expect(pub.map(r => r.tablename)).toEqual(['orders']);                      // users removed
  }, 60000);
});

describe('accounts that are not a branch device', () => {
  it('a stray signed-in account sees no tenant data', async () => {
    await as(db, 'authenticated', STRAY, async () => {
      for (const t of ['orders', 'users', 'customers', 'employees', 'expenses', 'order_items']) {
        expect(await count(t), t).toBe(0);
      }
    });
  });

  it('the super-admin manages tenants but sees no tenant data', async () => {
    await as(db, 'authenticated', SA, async () => {
      expect(await count('organizations')).toBe(2);   // 'o' + the org-default that 0018 creates
      expect(await count('orders')).toBe(0);
    });
  });
});

describe('customer and staff functions still work with RLS on', () => {
  it('a QR customer can join and order; a device can pay it', async () => {
    await db.exec(`UPDATE tables SET qr_token = '${'a'.repeat(64)}', ordering_enabled = true WHERE id = 'tA'`);
    const g = await as(db, 'anon', null, () => one<any>(db, `SELECT public.guest_join($1)`, ['a'.repeat(64)]));
    const st = await as(db, 'anon', null, () => one<any>(db, `SELECT public.guest_submit($1, $2::jsonb)`,
      [g.session_token, JSON.stringify([{ product_id: 'pA', quantity: 2 }])]));
    expect(st.items.length).toBeGreaterThan(0);
    const unpaid = (await as(db, 'authenticated', DEV_A, () =>
      db.query<any>(`SELECT id FROM order_items WHERE order_id = $1 AND NOT paid`, [st.order_id]))).rows.map(r => r.id);
    const paid = await as(db, 'authenticated', DEV_A, () =>
      db.query<any>(`SELECT * FROM public.pay_order_items($1, $2, 'cash', NULL, 'u', 'U', 'A')`, [st.order_id, unpaid]));
    expect(paid.rows[0].order_completed).toBe(true);
  });

  it('PIN login works on the right device only', async () => {
    const a = await as(db, 'authenticated', DEV_A, () => db.query<any>(`SELECT id FROM public.verify_staff_pin('1001', 't')`));
    expect(a.rows.map(r => r.id)).toEqual(['uA']);
    const b = await as(db, 'authenticated', DEV_B, () => db.query<any>(`SELECT id FROM public.verify_staff_pin('1001', 't')`));
    expect(b.rows).toEqual([]);
  });
});
