import { supabase } from '../../lib/supabase';
import type { Printer, Result } from '../models/types';

/**
 * Printers are shared per branch in the database (migration 0037). Every device keeps a
 * copy in localStorage ('alnawras_printers'), which the ticket/receipt printing reads,
 * so printing still works offline. The copy is refreshed at sign-in and on the Printers screen.
 */
const KEY = 'alnawras_printers';

export function cachedPrinters(branchId: string): Printer[] {
  try {
    const all: Printer[] = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(all) ? all.filter(p => p.branchId === branchId) : [];
  } catch { return []; }
}

function writeCache(branchId: string, printers: Printer[]) {
  try {
    const all: Printer[] = JSON.parse(localStorage.getItem(KEY) || '[]');
    const others = Array.isArray(all) ? all.filter(p => p.branchId !== branchId) : [];
    localStorage.setItem(KEY, JSON.stringify([...others, ...printers]));
  } catch { /* storage blocked */ }
}

const toRow = (p: Printer) => ({
  id: p.id, name: p.name, type: p.type, ip_address: p.ipAddress ?? null, port: p.port ?? null,
  usb_path: p.usbPath ?? null, stations: p.stations, is_active: p.isActive, branch_id: p.branchId,
  paper_width: p.paperWidth ?? 80,
});
const fromRow = (r: any): Printer => ({
  id: r.id, name: r.name, type: r.type, ipAddress: r.ip_address ?? undefined, port: r.port ?? undefined,
  usbPath: r.usb_path ?? undefined, stations: r.stations ?? [], isActive: r.is_active !== false,
  branchId: r.branch_id, createdAt: r.created_at, paperWidth: r.paper_width === 58 ? 58 : 80,
});

export class PrinterController {
  /** The branch's printers from the database (refreshes this device's copy). Offline: the copy. */
  static async load(branchId: string): Promise<Printer[]> {
    const { data, error } = await supabase.from('printers').select('*').eq('branch_id', branchId).order('created_at');
    if (error) return cachedPrinters(branchId);
    let printers = (data ?? []).map(fromRow);
    // Once per device (never again, so a printer deleted elsewhere doesn't come back): printers
    // set up only on this tablet join the branch's list, unless the same printer is already there.
    const flag = `alnawras_printers_shared_${branchId}`;
    let shared = false;
    try { shared = localStorage.getItem(flag) === '1'; } catch { /* storage blocked */ }
    if (!shared) {
      const where = (p: Printer) => p.type === 'network' ? `${p.ipAddress}:${p.port || 9100}` : `usb:${p.usbPath}`;
      const known = new Set(printers.map(where));
      const extra = cachedPrinters(branchId).filter(p => !known.has(where(p)));
      const { error: upErr } = extra.length ? await supabase.from('printers').upsert(extra.map(toRow)) : { error: null };
      if (!upErr) {
        printers = [...printers, ...extra];
        try { localStorage.setItem(flag, '1'); } catch { /* storage blocked */ }
      }
    }
    writeCache(branchId, printers);
    return printers;
  }

  static async save(p: Printer): Promise<Result<Printer>> {
    const { data, error } = await supabase.from('printers').upsert(toRow(p)).select('*').single();
    if (error) return { success: false, error: error.message };
    const saved = fromRow(data);
    writeCache(p.branchId, [...cachedPrinters(p.branchId).filter(x => x.id !== saved.id), saved]);
    return { success: true, data: saved };
  }

  static async remove(branchId: string, id: string): Promise<Result<null>> {
    const { error } = await supabase.from('printers').delete().eq('id', id).eq('branch_id', branchId);
    if (error) return { success: false, error: error.message };
    writeCache(branchId, cachedPrinters(branchId).filter(x => x.id !== id));
    return { success: true, data: null };
  }
}
