import { describe, it, expect } from 'vitest';
import { friendlyError, GENERIC_ERROR } from './errors';

describe('friendlyError', () => {
  it('passes through messages our database functions wrote for people', () =>
    expect(friendlyError({ code: 'P0001', message: 'Ordering is not switched on for this table yet.' }))
      .toBe('Ordering is not switched on for this table yet.'));

  it('maps database codes to plain sentences', () => {
    expect(friendlyError({ code: '23505', message: 'duplicate key value violates unique constraint "x"' })).toMatch(/already exists/);
    expect(friendlyError({ code: '42501', message: 'permission denied for table users' })).toMatch(/isn't allowed/);
  });

  it('maps technical text even without a code', () => {
    expect(friendlyError('permission denied for function pay_order')).toMatch(/isn't allowed/);
    expect(friendlyError('column "foo" does not exist')).toBe(GENERIC_ERROR);
    expect(friendlyError({ message: 'TypeError: Failed to fetch' })).toMatch(/No internet/);
  });

  it('keeps messages that are already human, and uses the fallback for nothing', () => {
    expect(friendlyError('PIN must be exactly 4 digits')).toBe('PIN must be exactly 4 digits');
    expect(friendlyError(undefined, 'Could not save')).toBe('Could not save');
  });
});
