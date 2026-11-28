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

  it('a merged bill prints its merged name in place of the Table row', () => {
    setBranding({ invoiceFrom: '' });
    const order = { items: [], tableNumber: 7, mergedLabel: 'Merged: Table 7 + Takeaway #0012' };
    const lines = buildReceiptLines({ ...base, order, businessName: 'Smart Cafe' });
    expect(lines).toContainEqual({ text: 'MERGED: TABLE 7 + TAKEAWAY #0012', style: 'bold', align: 'center' });
    expect(lines.some(l => typeof l === 'object' && 'text' in l && l.text === 'Table')).toBe(false);
  });

  it('a normal bill keeps the Table row', () => {
    const lines = buildReceiptLines({ ...base, order: { items: [], tableNumber: 7 }, businessName: 'Smart Cafe' });
    expect(lines).toContainEqual({ text: 'Table', value: 'Table 7' });
  });
});
