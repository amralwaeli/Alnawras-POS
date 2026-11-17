/** Executes 0034 on a real Postgres (see testdb.ts). */
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDb, as, one, fails } from './testdb';

const DEV_A = '11111111-1111-1111-1111-111111111111';
const DEV_B = '22222222-2222-2222-2222-222222222222';
let db: PGlite;

beforeAll(async () => {
  db = await makeDb();
  await db.exec(`
    INSERT INTO organizations(id, name) VALUES ('o', 'O');
    INSERT INTO branches(id, org_id, name) VALUES ('A', 'o', 'Branch A'), ('B', 'o', 'Branch B');
    INSERT INTO branch_logins(auth_uid, branch_id) VALUES ('${DEV_A}', 'A'), ('${DEV_B}', 'B');`);
}, 60000);

describe('keys are unique per restaurant, not across all of them', () => {
  it('both branches can have EMP-001, the same staff number, e-mail and SKU', async () => {
    for (const b of ['A', 'B']) {
      expect(await fails(db, `INSERT INTO employees(id, employee_id, employee_number, full_name, role, branch_id)
                              VALUES ('e${b}', 'EMP-001', 'EMP-001', 'N', 'waiter', '${b}')`)).toBeNull();
      expect(await fails(db, `INSERT INTO users(id, name, employment_number, role, email, branch_id)
                              VALUES ('u${b}', 'N', 'EMP-001', 'waiter', 'same@x.com', '${b}')`)).toBeNull();
      expect(await fails(db, `INSERT INTO products(id, name, category, price, sku, branch_id)
                              VALUES ('p${b}', 'Tea', 'D', 3, 'SKU-1', '${b}')`)).toBeNull();
    }
  });

  it('…but still unique inside one branch', async () => {
    expect(await fails(db, `INSERT INTO employees(id, employee_id, employee_number, full_name, role, branch_id)
                            VALUES ('eA2', 'EMP-001', 'EMP-001', 'N', 'waiter', 'A')`)).toMatch(/duplicate key|unique/);
    expect(await fails(db, `INSERT INTO users(id, name, employment_number, role, email, branch_id)
                            VALUES ('uA2', 'N', 'EMP-009', 'waiter', 'SAME@x.com', 'A')`)).toMatch(/duplicate key|unique/);
    expect(await fails(db, `INSERT INTO products(id, name, category, price, sku, branch_id)
                            VALUES ('pA2', 'Tea', 'D', 3, 'SKU-1', 'A')`)).toMatch(/duplicate key|unique/);
  });

  it('two branches\' EMP-001 can clock in and get payroll for the same day / month', async () => {
    for (const b of ['A', 'B']) {
      expect(await fails(db, `INSERT INTO attendance_logs(id, employee_id, full_name, log_date, branch_id)
                              VALUES ('a${b}', 'EMP-001', 'N', CURRENT_DATE, '${b}')`)).toBeNull();
      expect(await fails(db, `INSERT INTO payroll_summary(id, employee_id, full_name, month, year, branch_id)
                              VALUES ('pay${b}', 'EMP-001', 'N', 1, 2026, '${b}')`)).toBeNull();
    }
    expect(await fails(db, `INSERT INTO attendance_logs(id, employee_id, full_name, log_date, branch_id)
                            VALUES ('aA2', 'EMP-001', 'N', CURRENT_DATE, 'A')`)).toMatch(/duplicate key|unique/);
  });
});

describe('fingerprints stay with their own branch', () => {
  it("branch A's device never sees branch B's EMP-001 fingerprint", async () => {
    await db.exec(`INSERT INTO employee_fingerprints(id, employee_id, template_data, template_hash, finger_index, branch_id)
                   VALUES ('fA', 'EMP-001', 'x', 'h', 1, 'A'), ('fB', 'EMP-001', 'y', 'h2', 1, 'B')`);
    const seen = await as(db, 'authenticated', DEV_A, () => db.query<any>(`SELECT id FROM employee_fingerprints ORDER BY id`));
    expect(seen.rows.map(r => r.id)).toEqual(['fA']);
    expect(await as(db, 'authenticated', DEV_A, () => fails(db,
      `INSERT INTO employee_fingerprints(id, employee_id, template_data, template_hash, finger_index, branch_id)
       VALUES ('fX', 'EMP-001', 'z', 'h3', 1, 'B')`))).toMatch(/row-level security/);
  });
});

describe('branding', () => {
  it('branch_profile gives customer pages the name and currency, falling back to the branch name', async () => {
    expect(await as(db, 'anon', null, () => one(db, `SELECT public.branch_profile('A')`)))
      .toEqual({ business_name: 'Branch A', currency: 'RM' });
    await db.exec(`INSERT INTO branch_settings(branch_id, business_name, currency, kitchen_whatsapp) VALUES ('B', 'Sana''a Grill', 'SAR', '60123')`);
    expect(await as(db, 'anon', null, () => one(db, `SELECT public.branch_profile('B')`)))
      .toEqual({ business_name: "Sana'a Grill", currency: 'SAR' });
    expect(await as(db, 'anon', null, () => one(db, `SELECT public.branch_profile('nope')`))).toBeNull();
  });
});
