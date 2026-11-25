/** Executes 0046 on a real Postgres (see testdb.ts). */
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDb, fails } from './testdb';

let db: PGlite;
beforeAll(async () => {
  db = await makeDb();
  await db.exec(`INSERT INTO organizations(id, name) VALUES ('o', 'O');
    INSERT INTO branches(id, org_id, name) VALUES ('A', 'o', 'A');`);
}, 60000);

describe('0046 cancellation role', () => {
  it('accepts cancellation as a main role and as an extra role, still refuses unknown roles', async () => {
    expect(await fails(db, `INSERT INTO users(id, name, employment_number, role, pin, email, branch_id) VALUES ('c', 'C', 'E1', 'cancellation', '1234', 'c@x', 'A')`)).toBeNull();
    expect(await fails(db, `UPDATE users SET extra_roles = '{cancellation}' WHERE id = 'c'`)).toBeNull();
    expect(await fails(db, `UPDATE users SET role = 'boss' WHERE id = 'c'`)).toMatch(/users_role_check/);
  });
});
