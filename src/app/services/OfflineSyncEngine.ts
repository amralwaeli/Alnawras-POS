/**
 * OfflineSyncEngine
 *
 * When a device loses the network while sending items to an open bill, the
 * request is kept here and replayed through the same server function
 * (submit_order_items) once the connection returns — so prices, totals and
 * branch checks are still decided by the server. A replay the server REFUSES
 * (e.g. the bill was paid meanwhile, or a dish was removed) is dropped and the
 * staff are told, instead of retrying forever.
 *
 * A bill STARTED offline travels with its order row (newOrder): the replay
 * creates the bill first, then sends its items. Each line carries the device's
 * own id (client_id), so replaying an entry twice never adds a line twice.
 */
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';

interface QueuedItems {
  id: string;
  type: 'order_items';
  timestamp: string;
  orderId: string;
  branchId: string;
  addedBy: string;
  addedByName: string;
  items: { product_id: string; quantity: number; notes: string | null; option_ids: string[]; client_id?: string; printed?: boolean }[];
  /** The orders row to create first, when the bill itself was started offline. */
  newOrder?: Record<string, any>;
}

const QUEUE_KEY = 'alnawras_offline_queue';
let syncing = false;

// A failed fetch (no network) vs. the server answering "no".
export const isNetworkError = (e: any) =>
  !navigator.onLine || e?.name === 'TypeError' || /fetch|network/i.test(String(e?.message ?? ''));

function readQueue(): QueuedItems[] {
  try {
    const all = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    // Entries from the old format wrote rows directly with client prices; they cannot be replayed safely.
    return Array.isArray(all) ? all.filter((q: any) => q?.type === 'order_items') : [];
  } catch { return []; }
}

function writeQueue(q: QueuedItems[]) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* storage full / private mode */ }
}

export class OfflineSyncEngine {
  static addToQueue(entry: Omit<QueuedItems, 'id' | 'type' | 'timestamp'>) {
    const q = readQueue();
    q.push({ ...entry, id: crypto.randomUUID(), type: 'order_items', timestamp: new Date().toISOString() });
    writeQueue(q);
  }

  /** Lines this device printed itself while offline: the server marks them printed on replay,
   *  so the print station doesn't print them again (migration 0048). */
  static markPrinted(orderId: string, clientIds: string[]) {
    const ids = new Set(clientIds);
    writeQueue(readQueue().map(q => q.orderId !== orderId ? q
      : { ...q, items: q.items.map(i => (i.client_id && ids.has(i.client_id) ? { ...i, printed: true } : i)) }));
  }

  static pendingCount(): number { return readQueue().length; }

  /** Order rows of bills started offline and not yet on the server. */
  static queuedNewOrders(): Record<string, any>[] {
    return readQueue().flatMap(q => (q.newOrder ? [q.newOrder] : []));
  }

  static async sync() {
    if (syncing || !navigator.onLine) return;
    syncing = true;
    try {
      const remaining: QueuedItems[] = [];
      for (const item of readQueue()) {
        // Keep queue order per bill: later items must not race ahead of the entry that creates their bill.
        if (remaining.some(r => r.orderId === item.orderId)) { remaining.push(item); continue; }
        let createdNow = false;
        try {
          if (item.newOrder) {
            if (item.newOrder.order_type !== 'dine-in' && !item.newOrder.bill_number) {
              const { data, error } = await supabase.rpc('next_bill_number', {
                p_branch_id: item.branchId, p_order_type: item.newOrder.order_type,
              });
              if (error) throw error;
              // Stored on the entry, so a retry reuses this number instead of taking another.
              item.newOrder.bill_number = String(data);
            }
            const { error } = await supabase.from('orders').insert(item.newOrder);
            // 23505: an earlier attempt already created this bill.
            if (error && error.code !== '23505') throw error;
            createdNow = !error;
          }
          const { error } = await supabase.rpc('submit_order_items', {
            p_order_id: item.orderId, p_branch_id: item.branchId,
            p_added_by: item.addedBy, p_added_by_name: item.addedByName, p_items: item.items,
          });
          if (error) throw error;
          createdNow = false;
          if (item.newOrder?.table_id) {
            const { error: tableErr } = await supabase.from('tables')
              .update({ status: 'occupied', current_order_id: item.orderId })
              .eq('id', item.newOrder.table_id);
            // Retry the (idempotent) entry if the network dropped; other errors are ignored as online.
            if (tableErr && isNetworkError(tableErr)) throw tableErr;
          }
          toast.success('Items sent while offline have now reached the kitchen and the bill.');
        } catch (err: any) {
          if (isNetworkError(err)) { remaining.push(item); continue; }
          // Drop the empty bill this attempt just created, as the online path does.
          if (createdNow) await supabase.from('orders').delete().eq('id', item.orderId);
          toast.error(`Items sent while offline could not be added: ${err?.message}. Please re-enter them.`, { duration: 15000 });
        }
      }
      writeQueue(remaining);
    } finally {
      syncing = false;
    }
  }

  static start() {
    window.addEventListener('online', () => void OfflineSyncEngine.sync());
    setInterval(() => void OfflineSyncEngine.sync(), 60000);
    void OfflineSyncEngine.sync();
  }
}
