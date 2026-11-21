/** Executes 0037 on a real Postgres (see testdb.ts). */
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDb, as, fails } from './testdb';

const DEV_A = '11111111-1111-1111-1111-111111111111';
const DEV_B = '22222222-2222-2222-2222-222222222222';
let db: PGlite;

beforeAll(async () => {
  db = await makeDb();
  await db.exec(`
    INSERT INTO organizations(id, name) VALUES ('o', 'O');
    INSERT INTO branches(id, org_id, name) VALUES ('A', 'o', 'A'), ('B', 'o', 'B');
    INSERT INTO branch_logins(auth_uid, branch_id) VALUES ('${DEV_A}', 'A'), ('${DEV_B}', 'B');`);
}, 60000);

describe('shared printers', () => {
  it("a branch's devices share its printers; other branches and visitors can't see or write them", async () => {
    const add = (dev: string, branch: string, width = 80) => as(db, 'authenticated', dev, () => fails(db,
      `INSERT INTO printers(id, name, type, ip_address, port, stations, branch_id, paper_width)
       VALUES (gen_random_uuid()::text, 'Kitchen', 'network', '192.168.1.50', 9100, '{kitchen}', $1, $2)`, [branch, width]));
    expect(await add(DEV_A, 'A')).toBeNull();
    expect(await add(DEV_A, 'B')).toMatch(/row-level security/);
    expect(await add(DEV_A, 'A', 72)).toMatch(/paper_width/);
    const seenByB = await as(db, 'authenticated', DEV_B, () => db.query<any>(`SELECT id FROM printers`));
    expect(seenByB.rows).toEqual([]);
    const seenByA = await as(db, 'authenticated', DEV_A, () => db.query<any>(`SELECT paper_width FROM printers`));
    expect(seenByA.rows).toEqual([{ paper_width: 80 }]);
    expect(await as(db, 'anon', null, () => fails(db, `SELECT * FROM printers`))).toMatch(/permission denied/);
  });
});
