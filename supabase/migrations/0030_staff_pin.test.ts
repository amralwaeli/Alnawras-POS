/** Executes 0030 on a real Postgres (see testdb.ts). */
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDb, as, one, fails } from './testdb';

const DEV_A = '11111111-1111-1111-1111-111111111111';   // device signed in to branch A
const DEV_B = '22222222-2222-2222-2222-222222222222';   // device signed in to branch B
const NOBODY = '33333333-3333-3333-3333-333333333333';  // signed in, but not a branch device

let db: PGlite;
const verify = (dev: string | null, pin: string, terminal = 'till-1') =>
  as(db, dev ? 'authenticated' : 'anon', dev, async () => {
    try { return { rows: (await db.query<any>('SELECT * FROM public.verify_staff_pin($1, $2)', [pin, terminal])).rows }; }
    catch (e: any) { return { error: e.message as string }; }
  });
const addUser = (id: string, branch: string, pin: string) =>
  fails(db, `INSERT INTO users(id, name, employment_number, role, pin, email, branch_id)
             VALUES ($1, $1, $1, 'waiter', $2, $1 || '@x', $3)`, [id, pin, branch]);

beforeAll(async () => {
  db = await makeDb();
  await db.exec(`
    INSERT INTO organizations(id, name) VALUES ('o', 'O');
    INSERT INTO branches(id, org_id, name) VALUES ('A', 'o', 'A'), ('B', 'o', 'B');
    INSERT INTO branch_logins(auth_uid, branch_id) VALUES ('${DEV_A}', 'A'), ('${DEV_B}', 'B');`);
  expect(await addUser('ali', 'A', '1234')).toBeNull();
  expect(await addUser('sara', 'B', '1234')).toBeNull();     // same PIN, other branch: allowed
}, 60000);

describe('PIN storage', () => {
  it('keeps only the hash', async () => {
    expect(await one(db, `SELECT count(*) FROM users WHERE pin IS NOT NULL`)).toBe(0);
    expect(await one(db, `SELECT count(*) FROM users WHERE pin_hash IS NOT NULL`)).toBe(2);
  });

  it('refuses a PIN already used in the same branch', async () => {
    expect(await addUser('omar', 'A', '1234')).toMatch(/already used/);
  });

  it('refuses a PIN that is not 4 digits', async () => {
    expect(await addUser('zed', 'A', '12345')).toMatch(/exactly 4 digits/);
  });
});

describe('verify_staff_pin', () => {
  it('matches only staff of the device\'s branch', async () => {
    expect((await verify(DEV_A, '1234')).rows?.[0].id).toBe('ali');
    expect((await verify(DEV_B, '1234')).rows?.[0].id).toBe('sara');
  });

  it('is not callable without a branch device session', async () => {
    expect((await verify(null, '1234')).error).toMatch(/permission denied/);
    expect((await verify(NOBODY, '1234')).error).toMatch(/not signed in to a branch/);
  });

  it('locks one terminal after 5 wrong PINs; the other terminals keep working', async () => {
    for (let i = 0; i < 5; i++) expect((await verify(DEV_B, '0000', 'tab-1')).rows).toEqual([]);
    expect((await verify(DEV_B, '1234', 'tab-1')).error).toMatch(/Too many wrong PINs on this terminal/);
    expect((await verify(DEV_B, '1234', 'tab-2')).rows?.[0].id).toBe('sara');   // same branch, other terminal
    expect((await verify(DEV_A, '1234')).rows?.[0].id).toBe('ali');            // other branch
    await db.exec(`UPDATE pin_attempts SET attempted_at = NOW() - interval '2 minutes'`);
    expect((await verify(DEV_B, '1234', 'tab-1')).rows?.[0].id).toBe('sara');
  });

  it('a correct PIN does not reset the wrong-PIN count', async () => {
    await db.exec(`DELETE FROM pin_attempts`);
    for (let i = 0; i < 4; i++) await verify(DEV_B, '0000', 'tab-3');
    await verify(DEV_B, '1234', 'tab-3');                                        // known PIN in between
    await verify(DEV_B, '0000', 'tab-3');
    expect((await verify(DEV_B, '0000', 'tab-3')).error).toMatch(/Too many wrong PINs/);
  });

  it('caps the whole branch login at 30 wrong PINs a minute (rotating terminal ids does not help)', async () => {
    await db.exec(`DELETE FROM pin_attempts`);
    for (let i = 0; i < 30; i++) await verify(DEV_B, '0000', `fake-${i}`);
    expect((await verify(DEV_B, '1234', 'fresh')).error).toMatch(/at this branch/);
    await db.exec(`DELETE FROM pin_attempts`);
  });

  it('never returns the PIN or its hash', async () => {
    const cols = Object.keys((await verify(DEV_A, '1234')).rows?.[0] ?? {});
    expect(cols).not.toContain('pin');
    expect(cols).not.toContain('pin_hash');
  });
});

describe('API access to the staff table', () => {
  it('anon cannot read it at all', async () => {
    expect(await as(db, 'anon', null, () => fails(db, 'SELECT id FROM users'))).toMatch(/permission denied/);
  });

  it('a device can read staff columns but not pin or pin_hash', async () => {
    await as(db, 'authenticated', DEV_A, async () => {
      expect(await fails(db, 'SELECT id, name, role FROM users')).toBeNull();
      expect(await fails(db, 'SELECT pin_hash FROM users')).toMatch(/permission denied/);
      expect(await fails(db, 'SELECT * FROM users')).toMatch(/permission denied/);
      expect(await fails(db, `UPDATE users SET pin_hash = 'x' WHERE id = 'ali'`)).toMatch(/permission denied/);
    });
  });

  it('set_staff_pin works only inside the caller\'s branch', async () => {
    await as(db, 'authenticated', DEV_B, () => db.query(`SELECT public.set_staff_pin('ali', '9999')`));
    expect((await verify(DEV_A, '9999')).rows).toEqual([]);          // B could not change A's staff
    await as(db, 'authenticated', DEV_A, () => db.query(`SELECT public.set_staff_pin('ali', '9999')`));
    expect((await verify(DEV_A, '9999')).rows?.[0].id).toBe('ali');
  });
});
