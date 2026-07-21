import { describe, it, expect } from 'vitest';
import { localDateStr, monthDateRange } from './date';

describe('localDateStr', () => {
  it('formats the local calendar date, zero-padded', () => {
    // Construct with local Y/M/D so the assertion is timezone-independent.
    expect(localDateStr(new Date(2024, 0, 5))).toBe('2024-01-05');   // 5 Jan
    expect(localDateStr(new Date(2024, 11, 31))).toBe('2024-12-31'); // 31 Dec
  });

  it('uses the LOCAL day even just after local midnight (the bug UTC caused)', () => {
    // 00:30 local on 2 July — must be 2 July, not 1 July (which toISOString
    // would give for any east-of-UTC zone).
    expect(localDateStr(new Date(2024, 6, 2, 0, 30))).toBe('2024-07-02');
  });
});

describe('monthDateRange', () => {
  it('spans the first to the last local day of the month', () => {
    expect(monthDateRange(2024, 2)).toEqual({ start: '2024-02-01', end: '2024-02-29' }); // leap
    expect(monthDateRange(2023, 2)).toEqual({ start: '2023-02-01', end: '2023-02-28' });
    expect(monthDateRange(2024, 12)).toEqual({ start: '2024-12-01', end: '2024-12-31' });
    expect(monthDateRange(2024, 4)).toEqual({ start: '2024-04-01', end: '2024-04-30' });
  });
});
