/** Executes 0044 on a real Postgres (see testdb.ts). */
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDb, as, fails } from './testdb';

const DEV = '11111111-1111-1111-1111-111111111111';
let db: PGlite;
beforeAll(async () => {
  db = await makeDb();
  await db.exec(`
    INSERT INTO organizations(id, name) VALUES ('o', 'O');
    INSERT INTO branches(id, org_id, name) VALUES ('A', 'o', 'A');
    INSERT INTO branch_logins(auth_uid, branch_id) VALUES ('${DEV}', 'A');
    INSERT INTO users(id, name, employment_number, role, pin, email, branch_id) VALUES ('ali', 'Ali', 'E1', 'cashier', '1234', 'a@x', 'A');`);
}, 60000);

describe('0044 extra roles', () => {
  it('lets the branch device give an employee extra roles and read them back', async () => {
    const rows = await as(db, 'authenticated', DEV, async () => {
      await db.query(`UPDATE users SET extra_roles = '{hr,accounting,waiter}' WHERE id = 'ali'`);
      return (await db.query<any>(`SELECT extra_roles FROM users WHERE id = 'ali'`)).rows;
    });
    expect(rows[0].extra_roles).toEqual(['hr', 'accounting', 'waiter']);
  });

  it('refuses admin or an unknown role', async () => {
    expect(await fails(db, `UPDATE users SET extra_roles = '{admin}' WHERE id = 'ali'`)).toMatch(/extra_roles_valid/);
    expect(await fails(db, `UPDATE users SET extra_roles = '{boss}' WHERE id = 'ali'`)).toMatch(/extra_roles_valid/);
  });
});
