import { describe, it, expect } from 'vitest';
import { orderTotal } from './currency';

describe('orderTotal', () => {
  it('never charges for a voided (cancelled) item', () => {
    const order = { total: 0, items: [
      { price: 10, quantity: 2, status: 'served' },
      { price: 7, quantity: 1, status: 'cancelled' },
    ] };
    expect(orderTotal(order)).toBe(20);
  });
});
