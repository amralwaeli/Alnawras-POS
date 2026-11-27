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

  it('groups the same free drink from three meals into one line', () => {
    const meal = (id: string) => ({
      id, product_name: 'Family Meal', quantity: 1, station: 'kitchen',
      modifiers: [{ optionId: 'lemon', optionName: 'Lemon Juice' }], option_stations: { lemon: 'juice' },
    });
    const r = routeItems([meal('a'), meal('b'), meal('c')]);
    expect(r.get('juice')).toEqual([expect.objectContaining({ product_name: 'Lemon Juice', quantity: 3, ids: ['a', 'b', 'c'] })]);
    expect(r.get('kitchen')).toEqual([expect.objectContaining({ quantity: 3, ids: ['a', 'b', 'c'] })]);
  });

  it('does not merge different products, choices or notes', () => {
    const r = routeItems([
      { id: 'a', product_name: 'Tea', quantity: 1, station: 'juice', modifiers: [] },
      { id: 'b', product_name: 'Coffee', quantity: 1, station: 'juice', modifiers: [] },
      { id: 'c', product_name: 'Tea', quantity: 1, station: 'juice', modifiers: [{ optionName: 'Sugar' }] },
      { id: 'd', product_name: 'Tea', quantity: 1, station: 'juice', modifiers: [], notes: 'hot' },
      { id: 'e', product_name: 'Tea', quantity: 2, station: 'juice', modifiers: [], notes: '' },
    ]);
    expect(r.get('juice')!.map(l => [l.product_name, l.quantity, l.ids])).toEqual([
      ['Tea', 3, ['a', 'e']], ['Coffee', 1, ['b']], ['Tea', 1, ['c']], ['Tea', 1, ['d']],
    ]);
  });

  it('keeps a plain item at its own station only', () => {
    const r = routeItems([{ id: 'i3', product_name: 'Tea', quantity: 1, station: 'juice', modifiers: [] }]);
    expect([...r.keys()]).toEqual(['juice']);
  });
});
