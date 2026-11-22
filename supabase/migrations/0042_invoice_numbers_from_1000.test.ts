/** Executes 0042 on a real Postgres (see testdb.ts). */
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDb, as, one } from './testdb';

const DEV = '11111111-1111-1111-1111-111111111111';
let db: PGlite;
const save = (kind: string) => as(db, 'authenticated', DEV, () => one<any>(db,
  `SELECT public.save_document('A', $1, '{"invoiceTo":{"name":"Ali"},"total":5}'::jsonb, 'u', 'U')`, [kind]));

beforeAll(async () => {
  db = await makeDb();
  await db.exec(`
    INSERT INTO organizations(id, name) VALUES ('o', 'O');
    INSERT INTO branches(id, org_id, name) VALUES ('A', 'o', 'A');
    INSERT INTO branch_logins(auth_uid, branch_id) VALUES ('${DEV}', 'A');
    -- A branch that printed INV-0001 before 0042.
    INSERT INTO bill_counters(branch_id, order_type, last_number) VALUES ('A', 'doc-invoice', 1);`);
}, 60000);

describe('0042 invoice numbers from 1000', () => {
  it('jumps an existing low counter to INV-1000, then counts on', async () => {
    expect((await save('invoice')).number).toBe('INV-1000');
    expect((await save('invoice')).number).toBe('INV-1001');
  });

  it('leaves quotations starting at QUO-0001', async () => {
    expect((await save('quotation')).number).toBe('QUO-0001');
  });
});
