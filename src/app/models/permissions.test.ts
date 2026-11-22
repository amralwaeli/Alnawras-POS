import { describe, it, expect } from 'vitest';
import { permissionsFor, rolesOf, ROLE_PERMISSIONS } from './types';

describe('combined permissions for people with several jobs', () => {
  it('a cashier who is also HR and accountant gets all three roles\' access', () => {
    const p = permissionsFor({ role: 'cashier', extraRoles: ['hr', 'accounting'] });
    expect(p.canProcessPayments).toBe(true);                                   // cashier
    expect(p.canManageStaff).toBe(ROLE_PERMISSIONS.hr.canManageStaff);         // HR
    expect(p.canManageAccounting).toBe(ROLE_PERMISSIONS.accounting.canManageAccounting);
  });

  it('with no extra roles it is exactly the main role', () => {
    expect(permissionsFor({ role: 'waiter' })).toEqual(ROLE_PERMISSIONS.waiter);
  });

  it('lists each role once', () => {
    expect(rolesOf({ role: 'cashier', extraRoles: ['waiter', 'cashier'] })).toEqual(['cashier', 'waiter']);
  });
});
