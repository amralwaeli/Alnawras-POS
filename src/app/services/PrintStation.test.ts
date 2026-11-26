import { describe, it, expect, vi } from 'vitest';
vi.mock('../../lib/supabase', () => ({ supabase: {} }));
import { routeItems } from './PrintStation';

describe('routeItems', () => {
  it('sends a free drink choice to the drinks ticket and the meal to the kitchen', () => {
    const r = routeItems([{
      id: 'i1', product_name: 'Family Lamb Maqluba', quantity: 1, station: 'kitchen', also: [],
      modifiers: [{ optionId: 'lemon', optionName: 'Lemon Juice' }], option_stations: { lemon: 'juice' },
    }]);
    expect(r.get('kitchen')).toEqual([expect.objectContaining({ product_name: 'Family Lamb Maqluba', modifiers: [] })]);
    expect(r.get('juice')).toEqual([expect.objectContaining({ id: 'i1', product_name: 'Lemon Juice', quantity: 1 })]);
    expect(r.get('juice')![0].notes).toBeUndefined();
  });

  it('prints a shawarma plate at shawarma and the kitchen', () => {
    const r = routeItems([{ id: 'i2', product_name: 'Shawarma Plate', quantity: 2, station: 'shawarma', also: ['kitchen'], modifiers: [] }]);
    expect([...r.keys()].sort()).toEqual(['kitchen', 'shawarma']);
  });

  it('keeps a plain item at its own station only', () => {
    const r = routeItems([{ id: 'i3', product_name: 'Tea', quantity: 1, station: 'juice', modifiers: [] }]);
    expect([...r.keys()]).toEqual(['juice']);
  });
});
