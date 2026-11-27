import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFakeDb } from '../../test/fakeSupabase';

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: (t: string) => h.db.client.from(t) } }));

import { ProductController } from './ProductController';
import type { User, UserRole } from '../models/types';

const user = (role: UserRole): User => ({
  id: `u-${role}`, name: role, employmentNumber: '1', role, pin: '', email: '',
  status: 'active', branchId: 'b1', createdAt: new Date(),
});

describe('ProductController.getProducts permissions', () => {
  beforeEach(() => {
    h.db = createFakeDb({
      products: [
        { id: 'p1', name: 'Chicken Shawarma', station: 'shawarma', branch_id: 'b1', is_active: true, price: 5 },
        { id: 'p2', name: 'Lemon Juice', station: 'juice', branch_id: 'b1', is_active: true, price: 3 },
      ],
    });
  });

  it.each(['shawarma', 'juice', 'kitchen', 'waiter'] as UserRole[])('%s user gets the products', async role => {
    const res = await ProductController.getProducts(user(role));
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.map(p => p.id).sort()).toEqual(['p1', 'p2']);
  });

  it('a role with neither permission (hr) is refused', async () => {
    const res = await ProductController.getProducts(user('hr'));
    expect(res.success).toBe(false);
  });
});
