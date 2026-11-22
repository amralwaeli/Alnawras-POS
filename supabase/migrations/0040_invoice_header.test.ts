/** Executes 0040 on a real Postgres (see testdb.ts). */
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDb, fails } from './testdb';

let db: PGlite;
beforeAll(async () => {
  db = await makeDb();
  await db.exec(`
    INSERT INTO organizations(id, name) VALUES ('o', 'O');
    INSERT INTO branches(id, org_id, name) VALUES ('A', 'o', 'A');
    INSERT INTO branch_settings(branch_id) VALUES ('A');`);
});

describe('0040 invoice header', () => {
  it('stores the From lines and an https logo', async () => {
    await db.exec(`UPDATE branch_settings SET invoice_from = E'Cafe A\nStreet 1', logo_url = 'https://x.supabase.co/l.jpg' WHERE branch_id = 'A'`);
    const r = await db.query<{ invoice_from: string }>(`SELECT invoice_from FROM branch_settings WHERE branch_id = 'A'`);
    expect(r.rows[0].invoice_from).toBe('Cafe A\nStreet 1');
  });

  it('rejects a logo that is not https', async () => {
    expect(await fails(db, `UPDATE branch_settings SET logo_url = 'javascript:alert(1)' WHERE branch_id = 'A'`)).toMatch(/logo_url_https/);
    expect(await fails(db, `UPDATE branch_settings SET logo_url = 'http://x/l.png' WHERE branch_id = 'A'`)).toMatch(/logo_url_https/);
  });
});
