import { describe, it, expect } from 'vitest';
import { payPeriodForPayroll, currentPayPeriod } from './payPeriod';

describe('payPeriodForPayroll', () => {
  it('November 2026 covers 8 Nov to 7 Dec', () => {
    expect(payPeriodForPayroll(2026, 11)).toEqual({ from: '2026-11-08', to: '2026-12-07' });
  });
  it('December 2026 rolls into January 2027', () => {
    expect(payPeriodForPayroll(2026, 12)).toEqual({ from: '2026-12-08', to: '2027-01-07' });
  });
});

describe('currentPayPeriod', () => {
  it.each([
    [new Date(2026, 10, 28), '2026-11-08', '2026-12-07'],
    [new Date(2026, 11, 3), '2026-11-08', '2026-12-07'],
    [new Date(2026, 11, 7), '2026-11-08', '2026-12-07'],
    [new Date(2026, 11, 8), '2026-12-08', '2027-01-07'],
    [new Date(2027, 0, 3), '2026-12-08', '2027-01-07'],
  ])('%s', (today, from, to) => {
    const p = currentPayPeriod(today);
    expect({ from: p.from, to: p.to }).toEqual({ from, to });
    expect(p.payday.getDate()).toBe(7);
  });
});
