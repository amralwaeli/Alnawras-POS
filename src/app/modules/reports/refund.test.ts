import { describe, it, expect } from 'vitest';
import { refundEstimate } from './refund';

const items = [
  { id: 'a', amount: 30, cancelled: false, refundId: null },
  { id: 'b', amount: 10, cancelled: false, refundId: null },
  { id: 'c', amount: 50, cancelled: true, refundId: null },
];

describe('refundEstimate', () => {
  it('whole bill = total minus what was already refunded', () => {
    expect(refundEstimate(36, 0, items, null)).toBe(36);
    expect(refundEstimate(36, 27, items, null)).toBe(9);
  });

  it('chosen items get their share of the bill total (after discount/tax), ignoring cancelled items', () => {
    expect(refundEstimate(36, 0, items, ['a'])).toBe(27);       // 36 x 30/40
    expect(refundEstimate(10, 0, items, ['b'])).toBe(2.5);
    expect(refundEstimate(10, 0, items, [])).toBe(0);
  });

  it('the last items refunded take exactly what is left', () => {
    const half = items.map(i => i.id === 'a' ? { ...i, refundId: 'r1' } : i);
    expect(refundEstimate(10, 7.49, half, ['b'])).toBe(2.51);
  });
});
