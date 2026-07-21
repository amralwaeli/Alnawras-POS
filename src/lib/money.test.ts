import { describe, it, expect } from 'vitest';
import { round2, computeTax, presetDiscountAmount, taxInclusiveDue } from './money';
import type { DiscountPreset } from '../app/models/types';

describe('round2', () => {
  it('rounds to two decimals', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.344)).toBe(2.34);
    expect(round2(10)).toBe(10);
  });
});

describe('computeTax', () => {
  it('is zero when tax is disabled or rate/amount non-positive', () => {
    expect(computeTax(100, false, 6, false)).toBe(0);
    expect(computeTax(100, true, 0, false)).toBe(0);
    expect(computeTax(0, true, 6, false)).toBe(0);
    expect(computeTax(-5, true, 6, false)).toBe(0);
  });

  it('adds exclusive tax on top of the amount', () => {
    expect(computeTax(100, true, 6, false)).toBe(6);
    expect(computeTax(50, true, 10, false)).toBe(5);
    expect(computeTax(33.33, true, 6, false)).toBe(2); // 1.9998 → 2.00
  });

  it('backs inclusive tax out of the amount', () => {
    // 106 inclusive of 6% → tax portion is 6
    expect(computeTax(106, true, 6, true)).toBe(6);
    // 110 inclusive of 10% → tax portion is 10
    expect(computeTax(110, true, 10, true)).toBe(10);
  });
});

describe('presetDiscountAmount', () => {
  const pct = (v: number): DiscountPreset => ({ id: 'd', label: 'Student', type: 'percentage', value: v });
  const fixed = (v: number): DiscountPreset => ({ id: 'd', label: 'Staff', type: 'fixed', value: v });

  it('takes a percentage of the subtotal', () => {
    expect(presetDiscountAmount(100, pct(10))).toBe(10);
    expect(presetDiscountAmount(49.99, pct(10))).toBe(5); // 4.999 → 5.00
  });

  it('takes a fixed amount, capped at the subtotal', () => {
    expect(presetDiscountAmount(100, fixed(15))).toBe(15);
    expect(presetDiscountAmount(10, fixed(15))).toBe(10); // never discounts below zero
  });

  it('is zero for a non-positive subtotal or value', () => {
    expect(presetDiscountAmount(0, pct(10))).toBe(0);
    expect(presetDiscountAmount(100, pct(0))).toBe(0);
    expect(presetDiscountAmount(100, fixed(0))).toBe(0);
  });
});

describe('taxInclusiveDue', () => {
  it('adds exclusive tax to what the guest owes', () => {
    expect(taxInclusiveDue(100, true, 6, false)).toBe(106);
    expect(taxInclusiveDue(50, true, 10, false)).toBe(55);
  });

  it('leaves the amount unchanged when tax is inclusive (already in the price)', () => {
    expect(taxInclusiveDue(106, true, 6, true)).toBe(106);
  });

  it('equals the amount when tax is disabled', () => {
    expect(taxInclusiveDue(100, false, 6, false)).toBe(100);
  });
});
