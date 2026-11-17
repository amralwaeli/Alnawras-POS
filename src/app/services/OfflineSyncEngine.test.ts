import { describe, it, expect, vi, beforeEach } from 'vitest';

// A fake server: records calls; each test sets how it answers.
const calls: any[] = [];
const server = {
  rpc: vi.fn(async (_fn: string, _args: any): Promise<any> => ({ data: null, error: null })),
  insert: vi.fn(async (_row: any): Promise<any> => ({ error: null })),
};
vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: (fn: string, args: any) => { calls.push(['rpc', fn, args]); return server.rpc(fn, args); },
    from: (table: string) => ({
      insert: (row: any) => { calls.push(['insert', table, { ...row }]); return server.insert(row); },
      update: (vals: any) => ({ eq: async (_c: string, id: string) => { calls.push(['update', table, vals, id]); return { error: null }; } }),
      delete: () => ({ eq: async (_c: string, id: string) => { calls.push(['delete', table, id]); return { error: null }; } }),
    }),
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { OfflineSyncEngine } from './OfflineSyncEngine';

const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
});
vi.stubGlobal('navigator', { onLine: true });

const item = { product_id: 'p1', quantity: 1, notes: null, option_ids: [], client_id: 'item-00000000-0000-0000-0000-000000000001' };
const base = { branchId: 'b1', addedBy: 'u1', addedByName: 'Ali', items: [item] };
const netErr = { message: 'TypeError: Failed to fetch' };

beforeEach(() => {
  calls.length = 0;
  for (const k of Object.keys(store)) delete store[k];
  server.rpc.mockImplementation(async (fn: string) => ({ data: fn === 'next_bill_number' ? '0042' : [], error: null }));
  server.insert.mockImplementation(async () => ({ error: null }));
});

describe('OfflineSyncEngine replay', () => {
  it('creates a dine-in bill, sends its items, then marks the table occupied', async () => {
    OfflineSyncEngine.addToQueue({ ...base, orderId: 'order-1', newOrder: { id: 'order-1', table_id: 't5', order_type: 'dine-in' } });
    await OfflineSyncEngine.sync();
    expect(calls.map(c => c.slice(0, 2).join(':'))).toEqual(['insert:orders', 'rpc:submit_order_items', 'update:tables']);
    expect(calls[1][2].p_items[0].client_id).toBe(item.client_id);
    expect(calls[2][2]).toEqual({ status: 'occupied', current_order_id: 'order-1' });
    expect(OfflineSyncEngine.pendingCount()).toBe(0);
  });

  it('gets a takeaway bill number before inserting the bill', async () => {
    OfflineSyncEngine.addToQueue({ ...base, orderId: 'order-2', newOrder: { id: 'order-2', table_id: null, order_type: 'takeaway', bill_number: null } });
    await OfflineSyncEngine.sync();
    expect(calls[0]).toEqual(['rpc', 'next_bill_number', { p_branch_id: 'b1', p_order_type: 'takeaway' }]);
    expect(calls[1][2].bill_number).toBe('0042');
    expect(calls.some(c => c[0] === 'update')).toBe(false);
  });

  it('carries on when the bill already exists (23505 from an earlier attempt)', async () => {
    server.insert.mockImplementation(async () => ({ error: { code: '23505', message: 'duplicate key' } }));
    OfflineSyncEngine.addToQueue({ ...base, orderId: 'order-3', newOrder: { id: 'order-3', table_id: 't1', order_type: 'dine-in' } });
    await OfflineSyncEngine.sync();
    expect(calls.map(c => c[1])).toEqual(['orders', 'submit_order_items', 'tables']);
    expect(OfflineSyncEngine.pendingCount()).toBe(0);
  });

  it('keeps the entry (and its bill number) on a network error, and later items for that bill wait behind it', async () => {
    OfflineSyncEngine.addToQueue({ ...base, orderId: 'order-4', newOrder: { id: 'order-4', table_id: null, order_type: 'takeaway' } });
    OfflineSyncEngine.addToQueue({ ...base, orderId: 'order-4' });
    server.insert.mockImplementation(async () => ({ error: netErr }));
    await OfflineSyncEngine.sync();
    expect(OfflineSyncEngine.pendingCount()).toBe(2);
    expect(calls.filter(c => c[1] === 'submit_order_items')).toHaveLength(0);
    expect(OfflineSyncEngine.queuedNewOrders()[0].bill_number).toBe('0042');

    calls.length = 0;
    server.insert.mockImplementation(async () => ({ error: null }));
    await OfflineSyncEngine.sync();
    expect(calls.filter(c => c[1] === 'next_bill_number')).toHaveLength(0); // number reused, not re-taken
    expect(calls.filter(c => c[1] === 'submit_order_items')).toHaveLength(2);
    expect(OfflineSyncEngine.pendingCount()).toBe(0);
  });

  it('drops a refused entry and removes the empty bill it just created', async () => {
    server.rpc.mockImplementation(async () => ({ data: null, error: { message: 'Only 2 Mandi left' } }));
    OfflineSyncEngine.addToQueue({ ...base, orderId: 'order-5', newOrder: { id: 'order-5', table_id: 't2', order_type: 'dine-in' } });
    await OfflineSyncEngine.sync();
    expect(calls[calls.length - 1]).toEqual(['delete', 'orders', 'order-5']);
    expect(calls.some(c => c[0] === 'update')).toBe(false);
    expect(OfflineSyncEngine.pendingCount()).toBe(0);
  });

  it('still replays old entries that have no newOrder', async () => {
    store['alnawras_offline_queue'] = JSON.stringify([{ id: 'x', type: 'order_items', timestamp: '', orderId: 'order-6', ...base, items: [{ product_id: 'p1', quantity: 2, notes: null, option_ids: [] }] }]);
    await OfflineSyncEngine.sync();
    expect(calls.map(c => c[1])).toEqual(['submit_order_items']);
    expect(OfflineSyncEngine.pendingCount()).toBe(0);
  });
});
