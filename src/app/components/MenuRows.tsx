import type { CSSProperties } from 'react';
import type { Product } from '../models/types';

/** Menu grid width set in Manage Menu → Arrange (migration 0051).
 *  shortcut: one width for every branch, make it a branch setting if a restaurant asks. */
export const MENU_COLS = 5;

export type Cell = { row: number; col: number };

/** Menu order: row, column, then name. */
export const byMenuLayout = (a: Product, b: Product) =>
  (a.menuRow ?? 0) - (b.menuRow ?? 0) || (a.menuPos ?? 0) - (b.menuPos ?? 0) || a.name.localeCompare(b.name);

/** Each product's cell. A product with no free saved cell (new items, or menus never arranged:
 *  all at 0,0) takes the next free cell in reading order, so an unarranged menu looks as before. */
export function placeItems(products: Product[]): Map<string, Cell> {
  const out = new Map<string, Cell>();
  const taken = new Set<string>();
  const later: Product[] = [];
  for (const p of [...products].sort(byMenuLayout)) {
    const key = `${p.menuRow ?? 0},${p.menuPos ?? 0}`;
    if ((p.menuPos ?? 0) < MENU_COLS && !taken.has(key)) { taken.add(key); out.set(p.id, { row: p.menuRow ?? 0, col: p.menuPos ?? 0 }); }
    else later.push(p);
  }
  let i = 0;
  for (const p of later) {
    while (taken.has(`${Math.floor(i / MENU_COLS)},${i % MENU_COLS}`)) i++;
    const cell = { row: Math.floor(i / MENU_COLS), col: i % MENU_COLS };
    taken.add(`${cell.row},${cell.col}`);
    out.set(p.id, cell);
  }
  return out;
}

/** Drops `id` on `to`; an item already there swaps into the dragged item's old cell. */
export function dropOn(cells: Map<string, Cell>, id: string, to: Cell): Map<string, Cell> {
  const next = new Map(cells);
  const from = next.get(id);
  const other = [...next].find(([k, c]) => k !== id && c.row === to.row && c.col === to.col)?.[0];
  if (other && from) next.set(other, from);
  next.set(id, to);
  return next;
}

/** Sorts a menu's products by their cells (search off). */
export function sortByCells(products: Product[], cells: Map<string, Cell>): Product[] {
  const k = (p: Product) => { const c = cells.get(p.id); return c ? c.row * MENU_COLS + c.col : 1e9; };
  return [...products].sort((a, b) => k(a) - k(b));
}

/** Classes for a menu grid: from tablet width each card sits in its own cell (gaps stay empty);
 *  on phones the cards just follow the same order, two per row. */
export const MENU_GRID = 'grid-cols-2 sm:grid-cols-5 sm:[&>*]:[grid-row:var(--r)] sm:[&>*]:[grid-column:var(--c)]';

/** A menu's products in layout order, and each card's style (its cell). Searching: plain list. */
export function arrange(list: Product[], searching: boolean) {
  const cells = searching ? new Map<string, Cell>() : placeItems(list);
  return {
    items: searching ? list : sortByCells(list, cells),
    style: (id: string): CSSProperties | undefined => {
      const c = cells.get(id);
      return c ? ({ '--r': c.row + 1, '--c': c.col + 1 } as CSSProperties) : undefined;
    },
  };
}
