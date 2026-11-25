import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { isNativeApp } from '../../lib/platform';
import { PrintService } from './PrintService';
import { cachedPrinters } from '../controllers/PrinterController';

/**
 * Print station (migration 0048). Waiter phones and customer QR orders can be on any
 * internet; the printers only answer on the restaurant's own network. The one device
 * on that network with "Print station" on (the cashier tablet) prints every kitchen,
 * drinks and cancel ticket: it claims what is waiting, prints it, and gives back what
 * a printer refused so it is tried again on the next round.
 */
const KEY = 'alnawras_print_station';
const POLL_MS = 15_000;

let running: { branchId: string; stop: () => void } | null = null;
let busy = false;
let again = false;

export const isPrintStation = () => {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
};

export function setPrintStation(on: boolean, branchId: string | null) {
  try { on ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch { /* storage blocked */ }
  if (on && branchId) startPrintStation(branchId); else stopPrintStation();
}

export function startPrintStation(branchId: string) {
  if (!isNativeApp() || !isPrintStation()) return;
  if (running?.branchId === branchId) return;
  stopPrintStation();
  let debounce: ReturnType<typeof setTimeout> | undefined;
  const soon = () => { clearTimeout(debounce); debounce = setTimeout(() => void runOnce(branchId), 800); };
  // New or cancelled items wake the station at once; the timer catches anything realtime missed.
  const channel = supabase.channel(`print-station-${branchId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items', filter: `branch_id=eq.${branchId}` }, soon)
    .subscribe();
  const timer = setInterval(() => void runOnce(branchId), POLL_MS);
  window.addEventListener('online', soon);
  running = {
    branchId,
    stop: () => { clearTimeout(debounce); clearInterval(timer); window.removeEventListener('online', soon); void supabase.removeChannel(channel); },
  };
  void runOnce(branchId);
}

export function stopPrintStation() {
  running?.stop();
  running = null;
}

async function runOnce(branchId: string) {
  if (busy) { again = true; return; }
  busy = true;
  try {
    do {
      again = false;
      if (!navigator.onLine) return;
      const { data, error } = await supabase.rpc('claim_print_jobs', { p_branch_id: branchId });
      if (error || !data) return;
      await printClaimed(branchId, data.items ?? [], data.cancels ?? []);
    } while (again);
  } finally {
    busy = false;
  }
}

type Job = { ids: string[]; cancel: boolean; station: string; lines: (paper?: 58 | 80) => ReturnType<typeof PrintService.render> };

async function printClaimed(branchId: string, items: any[], cancels: any[]) {
  if (!items.length && !cancels.length) return;
  const label = (r: any) => ({ orderType: r.order_type, tableNumber: r.table_number, billNumber: r.bill_number });

  // One ticket per send (same bill, same moment) per station; one per cancelled item.
  const groups = new Map<string, any[]>();
  for (const it of items) {
    const k = `${it.order_id}|${it.created_at}|${it.station || 'kitchen'}`;
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  const jobs: Job[] = [
    ...[...groups.values()].map(g => ({
      ids: g.map(i => i.id), cancel: false, station: g[0].station || 'kitchen',
      lines: (paper?: 58 | 80) => PrintService.render(PrintService.formatKitchenTicket(label(g[0]), g, g[0].station || 'kitchen', g[0].add_on), paper),
    })),
    ...cancels.map(c => ({
      ids: [c.id], cancel: true, station: c.station || 'kitchen',
      lines: (paper?: 58 | 80) => PrintService.render(PrintService.formatCancelTicket(label(c), c, c.by || '', c.reason || undefined), paper),
    })),
  ];

  const printers = cachedPrinters(branchId).filter(p => p.isActive && p.type === 'network' && p.ipAddress);
  const printedOk = new Set<Job>();
  // Printers in parallel, one job at a time per printer (most take a single connection).
  await Promise.all(printers.map(async p => {
    for (const job of jobs.filter(j => (p.stations?.length ? p.stations : ['kitchen']).includes(j.station))) {
      const res = await PrintService.sendToPrinter({ printerIp: p.ipAddress!, printerPort: p.port || 9100, bytes: job.lines(p.paperWidth) });
      if (res.success) printedOk.add(job);
      else toast.error(`Printer ${p.name || p.ipAddress} not reachable — will retry`, { id: `print-station-${p.id}` });
    }
  }));

  // Retry a ticket only when no printer for its station took it (no station printer = nothing to do).
  const covered = (j: Job) => printers.some(p => (p.stations?.length ? p.stations : ['kitchen']).includes(j.station));
  const failed = jobs.filter(j => covered(j) && !printedOk.has(j));
  if (failed.length) {
    await supabase.rpc('release_print_jobs', {
      p_branch_id: branchId,
      p_item_ids: failed.filter(j => !j.cancel).flatMap(j => j.ids),
      p_cancel_ids: failed.filter(j => j.cancel).flatMap(j => j.ids),
    });
  }
}
