import { describe, it, expect, vi } from 'vitest';
vi.mock('../../lib/supabase', () => ({ supabase: {} }));
import { takenByNames } from './ReportsController';

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
