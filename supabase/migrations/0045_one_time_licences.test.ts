/** Executes 0045 on a real Postgres (see testdb.ts). */
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDb, as, fails } from './testdb';

let db: PGlite;
const URL_ = 'https://abcdefghijklmnopqrst.supabase.co';
beforeAll(async () => {
  db = await makeDb();
  await db.exec(`
    INSERT INTO onetime_tenants(id, name, email, project_ref, project_url, anon_key, license)
      VALUES ('t1', 'Cafe A', 'cafe@x.com', 'abcdefghijklmnopqrst', '${URL_}', 'anon-key', '{}');
    INSERT INTO smartpos_license(payload, sig) VALUES ('{"v":1}', 'sig');`);
}, 60000);

describe('0045 one-time licences', () => {
  it('finds a one-time customer\'s server by email, for anyone signing in', async () => {
    const rows = await as(db, 'anon', null, async () => (await db.query<any>(`SELECT * FROM find_server('  CAFE@x.com ')`)).rows);
    expect(rows).toEqual([{ project_url: URL_, anon_key: 'anon-key' }]);
    const none = await as(db, 'anon', null, async () => (await db.query<any>(`SELECT * FROM find_server('other@x.com')`)).rows);
    expect(none).toEqual([]);
  });

  it('keeps the register itself away from everyone but the super-admin', async () => {
    expect(await as(db, 'anon', null, () => fails(db, `SELECT * FROM onetime_tenants`))).toMatch(/permission denied/);
    const rows = await as(db, 'authenticated', '22222222-2222-2222-2222-222222222222', async () => (await db.query<any>(`SELECT * FROM onetime_tenants`)).rows);
    expect(rows).toEqual([]);   // signed in, not super-admin: RLS shows nothing
  });

  it('lets anyone read the licence but nobody change it through the API', async () => {
    const rows = await as(db, 'anon', null, async () => (await db.query<any>(`SELECT payload FROM smartpos_license`)).rows);
    expect(rows[0].payload).toBe('{"v":1}');
    expect(await as(db, 'authenticated', '22222222-2222-2222-2222-222222222222', () => fails(db, `UPDATE smartpos_license SET sig = 'x'`))).toMatch(/permission denied/);
  });
});
