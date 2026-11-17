import { describe, it, expect, vi } from 'vitest';
vi.mock('../../lib/supabase', () => ({ supabase: {} }));
import { nextEmployeeNumberFrom } from './WorkforceController';

describe('nextEmployeeNumberFrom', () => {
  it('starts at EMP-001', () => expect(nextEmployeeNumberFrom([])).toBe('EMP-001'));
  it('uses the highest number, not the row count (gaps after deletions)', () =>
    expect(nextEmployeeNumberFrom(['EMP-001', 'EMP-004', null, 'odd'])).toBe('EMP-005'));
  it('keeps going past 999', () => expect(nextEmployeeNumberFrom(['EMP-999'])).toBe('EMP-1000'));
});
