import { useState, type PointerEvent } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { usePOS } from '../../context/POSContext';
import type { Product } from '../../models/types';
import { MENU_COLS, placeItems, dropOn, type Cell } from '../../components/MenuRows';

/**
 * Drag items around a category's menu grid (like the POS layout of other tills). Dropping on an
 * empty cell moves the item there (gaps stay as they are); dropping on an item swaps the two.
 * Pointer events, so it works with a mouse and with a finger on a tablet.
 */
export function MenuLayoutEditor({ products }: { products: Product[] }) {
  const { updateProduct } = usePOS();
  const [cells, setCells] = useState(() => placeItems(products));
  const [drag, setDrag] = useState<{ id: string; x0: number; y0: number; dx: number; dy: number } | null>(null);
  const [over, setOver] = useState<Cell | null>(null);
  const [saving, setSaving] = useState(false);

  const rows = Math.max(-1, ...[...cells.values()].map(c => c.row)) + 2;   // one spare row to drop into
  const at = new Map([...cells].map(([id, c]) => [`${c.row},${c.col}`, id]));
  const byId = new Map(products.map(p => [p.id, p]));
  const changed = products.filter(p => {
    const c = cells.get(p.id);
    return c && (c.row !== (p.menuRow ?? 0) || c.col !== (p.menuPos ?? 0));
  });

  const cellAt = (x: number, y: number): Cell | null => {
    const el = document.elementsFromPoint(x, y).find(e => e instanceof HTMLElement && e.dataset.cell) as HTMLElement | undefined;
    if (!el) return null;
    const [row, col] = el.dataset.cell!.split(',').map(Number);
    return { row, col };
  };

  const down = (e: PointerEvent, id: string) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 });
  };
  const move = (e: PointerEvent) => {
    if (!drag) return;
    setDrag({ ...drag, dx: e.clientX - drag.x0, dy: e.clientY - drag.y0 });
    setOver(cellAt(e.clientX, e.clientY));
  };
  const up = (e: PointerEvent) => {
    if (!drag) return;
    const to = cellAt(e.clientX, e.clientY);
    if (to) setCells(c => dropOn(c, drag.id, to));
    setDrag(null);
    setOver(null);
  };

  const save = async () => {
    setSaving(true);
    const results = await Promise.all(changed.map(p => {
      const c = cells.get(p.id)!;
      return updateProduct(p.id, { menuRow: c.row, menuPos: c.col });
    }));
    setSaving(false);
    const failed = results.filter(r => !r?.success).length;
    if (failed) toast.error(`${failed} item(s) could not be saved — try again`);
    else toast.success('Menu layout saved');
  };

  if (!products.length) return <p className="py-10 text-center text-gray-500">No products in this tab yet.</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500">Drag an item to any square. Drop it on another item to swap them.</p>
        <Button onClick={save} disabled={!changed.length || saving}>
          {saving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
          Save layout{changed.length ? ` (${changed.length})` : ''}
        </Button>
      </div>
      <div className="grid gap-2 select-none" style={{ gridTemplateColumns: `repeat(${MENU_COLS}, minmax(0, 1fr))` }}>
        {Array.from({ length: rows * MENU_COLS }, (_, i) => {
          const cell = { row: Math.floor(i / MENU_COLS), col: i % MENU_COLS };
          const id = at.get(`${cell.row},${cell.col}`);
          const p = id ? byId.get(id) : undefined;
          const hot = over?.row === cell.row && over?.col === cell.col;
          const dragging = drag?.id === id;
          return (
            <div key={i} data-cell={`${cell.row},${cell.col}`}
              className={`min-h-20 rounded-xl border-2 border-dashed ${hot ? 'border-orange-500 bg-orange-50' : 'border-gray-200'}`}>
              {p && (
                <div
                  onPointerDown={e => down(e, p.id)} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { setDrag(null); setOver(null); }}
                  style={dragging ? { transform: `translate(${drag!.dx}px, ${drag!.dy}px)` } : undefined}
                  className={`h-full min-h-20 rounded-xl bg-white border border-gray-200 shadow-sm p-2 flex flex-col justify-between touch-none cursor-grab
                    ${dragging ? 'relative z-50 shadow-xl ring-2 ring-orange-400 cursor-grabbing pointer-events-auto' : ''}`}
                >
                  <p dir="auto" className="text-xs sm:text-sm font-semibold text-gray-900 leading-tight line-clamp-3 break-words">{p.name}</p>
                  <p className="text-[11px] sm:text-xs font-bold text-orange-600">RM {p.price.toFixed(2)}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
