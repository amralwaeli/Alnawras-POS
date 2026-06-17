/**
 * OfflineSyncEngine
 * 
 * Ensures that orders are persisted locally and printed even if the internet is down.
 * It periodically tries to sync local orders to Supabase when connection returns.
 */

import { supabase } from '../../lib/supabase';

export class OfflineSyncEngine {
  private static QUEUE_KEY = 'alnawras_offline_queue';

  /**
   * Adds an order to the local offline queue
   */
  static addToQueue(type: 'order' | 'payment', data: any) {
    const queue = this.getQueue();
    queue.push({ id: Date.now(), type, data, timestamp: new Date().toISOString() });
    localStorage.setItem(this.QUEUE_KEY, JSON.stringify(queue));
    console.log(`[OfflineSync] Added ${type} to queue. Total: ${queue.length}`);
  }

  /**
   * Attempts to sync the offline queue to the server
   */
  static async sync() {
    if (!navigator.onLine) return;
    
    const queue = this.getQueue();
    if (queue.length === 0) return;

    console.log(`[OfflineSync] Attempting to sync ${queue.length} items...`);
    const remaining = [];

    for (const item of queue) {
      try {
        let success = false;
        if (item.type === 'order') {
          const { error } = await supabase.from('orders').upsert(item.data.order);
          if (!error) {
            const { error: itemError } = await supabase.from('order_items').upsert(item.data.items);
            if (!itemError) success = true;
          }
        } else if (item.type === 'payment') {
          const { error } = await supabase.from('orders').update(item.data).eq('id', item.data.id);
          if (!error) success = true;
        }

        if (!success) remaining.push(item);
      } catch (err) {
        remaining.push(item);
      }
    }

    localStorage.setItem(this.QUEUE_KEY, JSON.stringify(remaining));
  }

  private static getQueue(): any[] {
    const raw = localStorage.getItem(this.QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  /**
   * Start the background sync process
   */
  static start() {
    window.addEventListener('online', () => this.sync());
    setInterval(() => this.sync(), 60000); // Check every minute
    void this.sync();
  }
}
