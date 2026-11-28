import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { isNativeApp } from '../../lib/platform';
import { PrintService, keepStationRunning, type PrintLine } from './PrintService';
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
  // In the background Android pauses this page's timers: the app's service calls this every 5 s.
  (window as any).__smartposStationTick = () => void runOnce(branchId);
  void keepStationRunning(true);
  running = {
    branchId,
    stop: () => {
      clearTimeout(debounce); clearInterval(timer); window.removeEventListener('online', soon); void supabase.removeChannel(channel);
      delete (window as any).__smartposStationTick;
      void keepStationRunning(false);
    },
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

/**
 * The ticket lines each station gets for one send: an item at its own station and at every
 * "also print at" station; a choice with its own station (e.g. the free juice of a family
 * meal) as a line of its own there, saying which item it is for (migration 0053).
 */
export function routeItems(items: any[]): Map<string, any[]> {
  const out = new Map<string, any[]>();
  const add = (station: string, line: any) => out.set(station, [...(out.get(station) ?? []), line]);
  for (const it of items) {
    const main = it.station || 'kitchen';
    const here = new Set([main, ...(it.also ?? [])]);
    const mods: any[] = Array.isArray(it.modifiers) ? it.modifiers : [];
    const elsewhere = (m: any) => { const s = it.option_stations?.[m.optionId]; return s && !here.has(s) ? s : null; };
    // A choice made at another station is left off this item's ticket (saves paper; staff match by bill number).
    const own = { ...it, modifiers: mods.filter(m => !elsewhere(m)) };
    for (const s of here) add(s, own);
    for (const m of mods) {
      const s = elsewhere(m);
      if (s) add(s, { id: it.id, product_name: m.optionName, quantity: it.quantity, modifiers: [], added_by_name: it.added_by_name });
    }
  }
  // Lines that would print the same (name, choices, notes) become one "7 x Lemon Juice" row.
  for (const [station, lines] of out) {
    const merged = new Map<string, any>();
    for (const l of lines) {
      const key = JSON.stringify([l.product_name || l.productName, (l.modifiers ?? []).map((m: any) => m.optionName || m.option_name), l.notes || '']);
      const m = merged.get(key);
      if (!m) merged.set(key, { ...l, ids: [l.id] });
      else { m.quantity = Number(m.quantity) + Number(l.quantity); if (!m.ids.includes(l.id)) m.ids.push(l.id); }
    }
    out.set(station, [...merged.values()]);
  }
  return out;
}

type Job = { ids: string[]; cancel: boolean; station: string; ticket: PrintLine[] };

const stationsOf = (p: { stations?: string[] | null }) => (p.stations?.length ? p.stations : ['kitchen']);
const STATION_NAMES: Record<string, string> = { kitchen: 'KITCHEN', juice: 'DRINKS', shawarma: 'SHAWARMA' };  // as formatKitchenTicket

const stationName = (station: string) => {
  const n = STATION_NAMES[station] || station.toUpperCase();
  return n.charAt(0) + n.slice(1).toLowerCase();
};

/** First line of a ticket printed at the cashier because its station's printer did not take it. */
export const offlineBanner = (station: string) =>
  `*** ${stationName(station).toUpperCase()} PRINTER OFFLINE — take to ${stationName(station)} ***`;

/** Cashier printers to try for a ticket its station did not print; printers of that station already had their try. */
export function fallbackTargets<P extends { stations?: string[] | null }>(station: string, printers: P[]): P[] {
  if (station === 'cashier') return [];
  return printers.filter(p => stationsOf(p).includes('cashier') && !stationsOf(p).includes(station));
}

async function printClaimed(branchId: string, items: any[], cancels: any[]) {
  if (!items.length && !cancels.length) return;
  const label = (r: any) => ({ orderType: r.order_type, tableNumber: r.table_number, billNumber: r.bill_number });

  // One ticket per send (same bill, same moment) per station; one per cancelled item and station.
  const sends = new Map<string, any[]>();
  for (const it of items) sends.set(`${it.order_id}|${it.created_at}`, [...(sends.get(`${it.order_id}|${it.created_at}`) ?? []), it]);
  const jobs: Job[] = [
    ...[...sends.values()].flatMap(g => [...routeItems(g)].map(([station, lines]) => ({
      ids: [...new Set(lines.flatMap(l => l.ids ?? [l.id]))] as string[], cancel: false, station,
      ticket: PrintService.formatKitchenTicket(label(g[0]), lines, station, g[0].add_on),
    }))),
    ...cancels.flatMap(c => [...new Set([c.station || 'kitchen', ...(c.also ?? [])])].map(station => ({
      ids: [c.id], cancel: true, station,
      ticket: PrintService.formatCancelTicket(label(c), c, c.by || '', c.reason || undefined),
    }))),
  ];

  const printers = cachedPrinters(branchId).filter(p => p.isActive && p.type === 'network' && p.ipAddress);
  const printedOk = new Set<Job>();
  const errors = new Map<Job, string>();
  // Printers in parallel, one job at a time per printer (most take a single connection).
  await Promise.all(printers.map(async p => {
    for (const job of jobs.filter(j => stationsOf(p).includes(j.station))) {
      const res = await PrintService.sendToPrinter({ printerIp: p.ipAddress!, printerPort: p.port || 9100, bytes: PrintService.render(job.ticket, p.paperWidth) });
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
  // An item printed on several tickets is printed only when all of them printed.
  const covered = (j: Job) => printers.some(p => stationsOf(p).includes(j.station));

  // A station printer that did not take its ticket (e.g. the shawarma printer dropped off
  // the network): print it at the cashier with a banner saying where to take it.
  // One ticket at a time, first cashier printer that takes it; rare, so speed does not matter.
  for (const job of jobs.filter(j => covered(j) && !printedOk.has(j))) {
    const ticket: PrintLine[] = [{ text: offlineBanner(job.station), style: 'bold', align: 'center' }, ...job.ticket];
    for (const p of fallbackTargets(job.station, printers)) {
      const res = await PrintService.sendToPrinter({ printerIp: p.ipAddress!, printerPort: p.port || 9100, bytes: PrintService.render(ticket, p.paperWidth) });
      if (!res.success) continue;
      printedOk.add(job);
      toast.warning(`${stationName(job.station)} printer offline — printed at ${p.name || p.ipAddress}`, { id: `print-fallback-${job.station}-${p.id}` });
      break;
    }
  }
  const failed = jobs.filter(j => covered(j) && !printedOk.has(j));
  const failedItems = new Set(failed.filter(j => !j.cancel).flatMap(j => j.ids));
  const done = [...new Set(jobs.filter(j => !j.cancel).flatMap(j => j.ids))].filter(id => !failedItems.has(id));
  if (done.length) await supabase.rpc('confirm_print_jobs', { p_branch_id: branchId, p_item_ids: done });
  if (failed.length) {
    await supabase.rpc('release_print_jobs', {
      p_branch_id: branchId,
      p_item_ids: [...failedItems],
      p_cancel_ids: failed.filter(j => j.cancel).flatMap(j => j.ids),
      p_error: errors.get(failed.find(j => !j.cancel) ?? failed[0]) ?? 'Printer did not print',
    });
  }
}

/**
 * On the phone that sent the order: checks that its kitchen tickets really printed. Items
 * whose ticket did not print (a printer refused it, or nothing printed it in 25 seconds,
 * e.g. the cashier tablet is off) are taken off the bill (migration 0050), and a beeping
 * full-screen alert says NOT PRINTED with Send again (adds them back as a new send).
 * Items a station is printing right now are left alone and checked again.
 */
export function watchPrinting(o: {
  branchId: string; orderId: string; ids: string[]; label: string; dropEmptyBill: boolean;
  resend: (removedIds: string[], billDropped: boolean) => Promise<{ success: boolean; error?: string }>;
}) {
  const started = Date.now();
  let pending = [...o.ids];
  const check = async () => {
    const { data, error } = await supabase.from('order_items')
      .select('id, printed_at, print_error, product_name, quantity').in('id', pending);
    if (!error) {
      const unprinted = (data ?? []).filter((r: any) => !r.printed_at);
      pending = unprinted.map((r: any) => r.id);
      if (!pending.length) return;                       // all printed
      if (unprinted.some((r: any) => r.print_error) || Date.now() - started > 25_000) {
        const { data: w, error: wErr } = await supabase.rpc('withdraw_unprinted_items', {
          p_branch_id: o.branchId, p_order_id: o.orderId, p_item_ids: pending, p_drop_empty_bill: o.dropEmptyBill,
        });
        const removed: string[] = wErr ? [] : (w?.removed ?? []);
        if (removed.length) {
          const gone = unprinted.filter((r: any) => removed.includes(r.id));
          showNotPrinted(o, removed, !!w?.bill_dropped,
            gone.map((r: any) => `${r.quantity} x ${r.product_name}`), gone.find((r: any) => r.print_error)?.print_error);
          pending = pending.filter(id => !removed.includes(id));
        }
      }
    }
    if (pending.length && Date.now() - started < 30 * 60_000) setTimeout(check, error ? 5000 : 3000);
  };
  setTimeout(check, 2500);
}

function showNotPrinted(o: Parameters<typeof watchPrinting>[0], removed: string[], billDropped: boolean, names: string[], reason?: string) {
  const id = `print-${removed[0]}`;
  AlertService.push({
    id, kind: 'print', title: `${o.label} — NOT PRINTED`,
    body: `${reason ? `${reason}.` : 'The cashier tablet did not print it.'} The kitchen does not have it, so it was taken off the bill:\n`
      + `${names.join('\n')}\nCheck the ${reason ? 'printer' : 'cashier tablet (Print station on)'}, then press Send again.`,
    action: {
      label: 'Send again',
      run: async () => {
        AlertService.dismiss(id);
        const res = await o.resend(removed, billDropped);
        if (res.success) toast.success('Sent again');
        else { toast.error(`Not sent: ${res.error}`); showNotPrinted(o, removed, billDropped, names, reason); }
      },
    },
    dismissLabel: "Don't send",
  });
}
