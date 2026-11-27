import { describe, it, expect } from 'vitest';
import { daysOffDeduction } from './daysOff';

describe('daysOffDeduction', () => {
  it('deducts nothing within the allowance', () => {
    expect(daysOffDeduction(2, 3000)).toEqual({ extraDays: 0, deduction: 0 });
    expect(daysOffDeduction(0, 3000)).toEqual({ extraDays: 0, deduction: 0 });
  });

  it('deducts each extra day at salary / 30', () => {
    expect(daysOffDeduction(3, 3000)).toEqual({ extraDays: 1, deduction: 100 });
  });
});
