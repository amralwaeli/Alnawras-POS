import { describe, it, expect, vi } from 'vitest';
vi.mock('../../../lib/supabase', () => ({ supabase: {} }));
import { buildReceiptLines } from './PaymentModal';
import { setBranding } from '../../../lib/branding';

const base = { billNo: '0001', cashier: 'Ali', order: { items: [] }, totals: { subtotal: 0, tax: 0, discount: 0, total: 0 } };

describe('receipt header', () => {
  it('prints logo, name, then the invoiceFrom address/phone lines (duplicate name skipped)', () => {
    setBranding({ invoiceFrom: 'smart cafe\r\nBaghdad, Karrada St.\n\n0770 123 4567' });
    const lines = buildReceiptLines({ ...base, businessName: 'Smart Cafe' });
    expect(lines[0]).toBe('logo');
    expect(lines.slice(1, 4)).toEqual([
      { text: 'SMART CAFE', style: 'large', align: 'center' },
      { text: 'Baghdad, Karrada St.', align: 'center' },
      { text: '0770 123 4567', align: 'center' },
    ]);
  });

  it('keeps a first line that is not the name', () => {
    setBranding({ invoiceFrom: 'Branch 2' });
    const lines = buildReceiptLines({ ...base, businessName: 'Smart Cafe' });
    expect(lines[2]).toEqual({ text: 'Branch 2', align: 'center' });
  });
});
