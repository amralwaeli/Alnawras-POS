/** Executes 0038 on a real Postgres (see testdb.ts); the debt tests (0036) re-run against the new summary. */
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDb, one } from './testdb';

let db: PGlite;
beforeAll(async () => { db = await makeDb(); }, 60000);

describe('0038', () => {
  it('current_device_branch is STABLE and the hot-path indexes exist', async () => {
    expect(await one(db, `SELECT provolatile FROM pg_proc WHERE proname = 'current_device_branch'`)).toBe('s');
    const idx = (await db.query<any>(`SELECT indexname FROM pg_indexes WHERE indexname IN
      ('idx_orders_branch_completed', 'idx_orders_open_table', 'idx_order_payments_branch_time')`)).rows.map(r => r.indexname).sort();
    expect(idx).toEqual(['idx_order_payments_branch_time', 'idx_orders_branch_completed', 'idx_orders_open_table']);
  });
});
