import { describe, it, expect, vi } from 'vitest';
vi.mock('../../lib/supabase', () => ({ supabase: {} }));
import { takenByNames, cashierNames } from './ReportsController';

describe('cashierNames', () => {
  it('joins distinct payment cashiers, null when none', () => {
    expect(cashierNames([{ cashier_name: 'sara' }, { cashier_name: 'omar' }, { cashier_name: 'sara' }])).toBe('sara, omar');
    expect(cashierNames([{ cashier_name: null }])).toBeNull();
    expect(cashierNames(undefined)).toBeNull();
  });
});

describe('takenByNames', () => {
  it('lists distinct live adders, skipping cancelled items', () => {
    expect(takenByNames([
      { added_by_name: 'wadeea', status: 'served' }, { added_by_name: 'waqar', status: 'ready' },
      { added_by_name: 'wadeea', status: 'served' }, { added_by_name: 'ali', status: 'cancelled' },
    ])).toBe('wadeea, waqar');
  });
  it('falls back to Guest / QR when nobody is named', () => {
    expect(takenByNames([])).toBe('Guest / QR');
    expect(takenByNames(null)).toBe('Guest / QR');
    expect(takenByNames([{ added_by_name: ' ', status: 'served' }])).toBe('Guest / QR');
  });
});
