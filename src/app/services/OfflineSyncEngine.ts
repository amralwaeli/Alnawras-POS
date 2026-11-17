/**
 * OfflineSyncEngine
 *
 * When a device loses the network while sending items to an open bill, the
 * request is kept here and replayed through the same server function
 * (submit_order_items) once the connection returns — so prices, totals and
 * branch checks are still decided by the server. A replay the server REFUSES
 * (e.g. the bill was paid meanwhile, or a dish was removed) is dropped and the
 * staff are told, instead of retrying forever.
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
  items: { product_id: string; quantity: number; notes: string | null; option_ids: string[] }[];
}

const QUEUE_KEY = 'alnawras_offline_queue';
let syncing = false;

// A failed fetch (no network) vs. the server answering "no".
const isNetworkError = (e: any) =>
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

  static pendingCount(): number { return readQueue().length; }

  static async sync() {
    if (syncing || !navigator.onLine) return;
    syncing = true;
    try {
      const remaining: QueuedItems[] = [];
      for (const item of readQueue()) {
        try {
          const { error } = await supabase.rpc('submit_order_items', {
            p_order_id: item.orderId, p_branch_id: item.branchId,
            p_added_by: item.addedBy, p_added_by_name: item.addedByName, p_items: item.items,
          });
          if (!error) { toast.success('Items sent while offline have now reached the kitchen and the bill.'); continue; }
          if (isNetworkError(error)) { remaining.push(item); continue; }
          toast.error(`Items sent while offline could not be added: ${error.message}. Please re-enter them.`, { duration: 15000 });
        } catch (err) {
          if (isNetworkError(err)) remaining.push(item);
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
