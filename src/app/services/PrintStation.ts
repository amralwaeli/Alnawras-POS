import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { isNativeApp } from '../../lib/platform';
import { PrintService } from './PrintService';
import { cachedPrinters } from '../controllers/PrinterController';
import { AlertService } from './AlertService';

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
  const errors = new Map<Job, string>();
  // Printers in parallel, one job at a time per printer (most take a single connection).
  await Promise.all(printers.map(async p => {
    for (const job of jobs.filter(j => (p.stations?.length ? p.stations : ['kitchen']).includes(j.station))) {
      const res = await PrintService.sendToPrinter({ printerIp: p.ipAddress!, printerPort: p.port || 9100, bytes: job.lines(p.paperWidth) });
      if (res.success) printedOk.add(job);
      else {
        errors.set(job, `${p.name || p.ipAddress} printer did not print`);
        toast.error(`Printer ${p.name || p.ipAddress} not reachable — will retry`, { id: `print-station-${p.id}` });
      }
    }
  }));

  // A ticket counts as printed when any printer of its station took it; a station with no
  // printer has nothing to print (e.g. a kitchen screen). The rest go back, with the reason
  // the waiter sees, and are tried again on the next round.
  const covered = (j: Job) => printers.some(p => (p.stations?.length ? p.stations : ['kitchen']).includes(j.station));
  const done = jobs.filter(j => !j.cancel && (printedOk.has(j) || !covered(j))).flatMap(j => j.ids);
  const failed = jobs.filter(j => covered(j) && !printedOk.has(j));
  if (done.length) await supabase.rpc('confirm_print_jobs', { p_branch_id: branchId, p_item_ids: done });
  if (failed.length) {
    await supabase.rpc('release_print_jobs', {
      p_branch_id: branchId,
      p_item_ids: failed.filter(j => !j.cancel).flatMap(j => j.ids),
      p_cancel_ids: failed.filter(j => j.cancel).flatMap(j => j.ids),
      p_error: errors.get(failed.find(j => !j.cancel) ?? failed[0]) ?? 'Printer did not print',
    });
  }
}

/**
 * On the phone that sent the order: checks that the kitchen tickets really printed. If a
 * printer refused them, or nothing printed them in 20 seconds (cashier tablet off), a beeping
 * full-screen alert says NOT PRINTED with a Send again button. It closes itself once printed.
 */
export function watchPrinting(branchId: string, ids: string[], label: string) {
  const alertId = `print-${ids[0]}`;
  let since = Date.now();
  let stopped = false;
  const check = async () => {
    if (stopped) return;
    const { data, error } = await supabase.from('order_items').select('id, printed_at, print_error').in('id', ids);
    const waiting = (data ?? []).filter((r: any) => !r.printed_at);
    if (!error && !waiting.length) {
      if (AlertService.isShowing(alertId)) { AlertService.dismiss(alertId); toast.success(`${label}: printed in the kitchen`); }
      return;
    }
    const reason = waiting.find((r: any) => r.print_error)?.print_error;
    if (!error && (reason || Date.now() - since > 20_000)) {
      AlertService.push({
        id: alertId, kind: 'print', title: `${label} — NOT PRINTED`,
        body: reason
          ? `${reason}. The kitchen does not have this order yet. Check the printer is on, then press Send again.`
          : 'The cashier tablet has not printed it. Check the tablet is on with Print station switched on, then press Send again.',
        action: {
          label: 'Send again',
          run: async () => {
            AlertService.dismiss(alertId);
            since = Date.now();
            await supabase.rpc('release_print_jobs', { p_branch_id: branchId, p_item_ids: waiting.map((r: any) => r.id), p_cancel_ids: [] });
          },
        },
        onDismiss: () => { stopped = true; },   // "Close": the waiter told the kitchen another way
      });
    }
    // Keep checking until it prints (the station also retries on its own), at most 30 minutes.
    if (Date.now() - since < 30 * 60_000) setTimeout(check, error ? 5000 : 3000);
  };
  setTimeout(check, 2500);
}
