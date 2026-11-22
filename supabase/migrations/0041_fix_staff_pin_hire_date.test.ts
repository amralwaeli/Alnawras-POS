/** Executes 0041 on a real Postgres (see testdb.ts), with the live project's column type. */
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDb, as } from './testdb';

const DEV = '11111111-1111-1111-1111-111111111111';
let db: PGlite;

beforeAll(async () => {
  db = await makeDb();
  await db.exec(`
    ALTER TABLE users ALTER COLUMN hire_date TYPE timestamptz;   -- as on the live project
    INSERT INTO organizations(id, name) VALUES ('o', 'O');
    INSERT INTO branches(id, org_id, name) VALUES ('A', 'o', 'A');
    INSERT INTO branch_logins(auth_uid, branch_id) VALUES ('${DEV}', 'A');
    INSERT INTO users(id, name, employment_number, role, pin, email, branch_id, hire_date)
      VALUES ('ali', 'Ali', 'E1', 'waiter', '1234', 'ali@x', 'A', '2026-11-01 09:00+08');`);
}, 60000);

describe('0041 verify_staff_pin with a timestamptz hire_date', () => {
  it('signs staff in and returns the hire date as a date', async () => {
    const rows = await as(db, 'authenticated', DEV, async () =>
      (await db.query<any>('SELECT * FROM public.verify_staff_pin($1, $2)', ['1234', 'till-1'])).rows);
    expect(rows[0].id).toBe('ali');
    expect(rows[0].hire_date).toBeTruthy();
  });
});
