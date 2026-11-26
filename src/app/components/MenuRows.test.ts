import { describe, it, expect } from 'vitest';
import { placeItems, dropOn, sortByCells } from './MenuRows';

const p = (id: string, name: string, menuRow = 0, menuPos = 0) => ({ id, name, menuRow, menuPos }) as any;

describe('menu grid', () => {
  it('lays out a never-arranged menu in name order, 5 per row', () => {
    const items = ['f', 'e', 'd', 'c', 'b', 'a'].map(n => p(n, n));
    const cells = placeItems(items);
    expect(cells.get('a')).toEqual({ row: 0, col: 0 });
    expect(cells.get('e')).toEqual({ row: 0, col: 4 });
    expect(cells.get('f')).toEqual({ row: 1, col: 0 });
  });

  it('keeps saved cells, gaps included, and fits new items into free cells', () => {
    const cells = placeItems([p('chicken', 'Chicken', 0, 2), p('lamb', 'Lamb', 1, 0), p('new', 'New')]);
    expect(cells.get('chicken')).toEqual({ row: 0, col: 2 });
    expect(cells.get('lamb')).toEqual({ row: 1, col: 0 });
    expect(cells.get('new')).toEqual({ row: 0, col: 0 });
  });

  it('drops into an empty cell, or swaps with the item there', () => {
    const cells = new Map([['a', { row: 0, col: 0 }], ['b', { row: 0, col: 1 }]]);
    expect(dropOn(cells, 'a', { row: 2, col: 3 }).get('a')).toEqual({ row: 2, col: 3 });
    const swapped = dropOn(cells, 'a', { row: 0, col: 1 });
    expect(swapped.get('a')).toEqual({ row: 0, col: 1 });
    expect(swapped.get('b')).toEqual({ row: 0, col: 0 });
  });

  it('sorts by cell for phones', () => {
    const items = [p('x', 'X'), p('y', 'Y')];
    const cells = new Map([['x', { row: 1, col: 0 }], ['y', { row: 0, col: 4 }]]);
    expect(sortByCells(items, cells).map(i => i.id)).toEqual(['y', 'x']);
  });
});
