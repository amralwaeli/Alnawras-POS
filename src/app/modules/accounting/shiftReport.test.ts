import { describe, it, expect, vi } from 'vitest';
vi.mock('../../../lib/supabase', () => ({ supabase: {} }));
import { shiftReportLines } from './ShiftManagementView';

const value = (lines: any[], text: string) => lines.find(l => l !== 'rule' && l.text === text)?.value;

describe('shift report', () => {
  const lines = shiftReportLines({
    businessName: 'Belad', openedBy: 'Wadeea', closedBy: 'Senan', openedAt: new Date(), closedAt: new Date(),
    openingCash: 500, countedCash: 1100, debtCash: 20,
    sales: { revenue: 900, discount: 10, orders: 12, byMethod: { cash: 700, card: 200 } },
    paidOut: [
      { category: 'salary', description: 'Salary / advance', amount: 100, employee_name: 'Hameed' },
      { category: 'supplies', description: 'Gas', amount: 30 },
    ],
  });

  it('names who opened the shift, and who closed it only when someone else did', () => {
    expect(lines.some((l: any) => l.text === 'Opened by: Wadeea')).toBe(true);
    expect(lines.some((l: any) => l.text === 'Closed by: Senan')).toBe(true);
    const same = shiftReportLines({ businessName: 'B', openedBy: 'Senan', closedBy: 'Senan', openedAt: new Date(), closedAt: new Date(),
      openingCash: 0, countedCash: 0, debtCash: 0, sales: { revenue: 0, discount: 0, orders: 0, byMethod: {} }, paidOut: [] });
    expect(same.some((l: any) => l.text?.startsWith('Closed by'))).toBe(false);
  });

  it('takes money paid out of the drawer off the expected cash', () => {
    expect(value(lines, 'Expected cash')).toBe('RM 1090.00');   // 500 + 700 + 20 - 130
    expect(value(lines, 'Difference')).toBe('RM 10.00');
  });

  it('lists each advance under the employee and sales by payment method', () => {
    expect(value(lines, 'Salary: Hameed')).toBe('RM 100.00');
    expect(value(lines, 'Supplies')).toBe('RM 30.00');
    expect(lines.some((l: any) => l.text === '  Gas')).toBe(true);
    expect(value(lines, '  Card')).toBe('RM 200.00');
    expect(value(lines, 'Bills paid')).toBe('12');
  });
});
