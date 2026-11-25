import { Order, Result, SelectedModifier } from '../models/types';
import { mapOrder } from '../models/mappers';
import { supabase } from '../../lib/supabase';
import { PrintService } from '../services/PrintService';
import { OfflineSyncEngine, isNetworkError } from '../services/OfflineSyncEngine';
import { toast } from 'sonner';
import { cachedPrinters } from './PrinterController';

export interface SubmitOrderItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  notes?: string;
  station?: 'kitchen' | 'juice' | 'shawarma' | 'none';
  /** Chosen modifier options for this line; `price` already includes their add-ons. */
  modifiers?: SelectedModifier[];
}

export interface PickupDetails {
  method: 'grab' | 'lalamove' | 'self';
  payType: 'cash' | 'online';
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  receiptUrl?: string;
  /** 'unpaid' for cash (pay at pickup), 'pending_verification' for online. */
  paymentStatus: 'unpaid' | 'pending_verification';
}

export interface SubmitOrderParams {
  branchId: string;
  orderType: 'dine-in' | 'takeaway' | 'pickup';
  /** Required for dine-in; null/omitted for takeaway & pickup. */
  table?: { id: string; number: number } | null;
  /** Reuse an already-open order if known. */
  existingOrderId?: string | null;
  items: SubmitOrderItem[];
  addedBy: string;
  addedByName: string;
  /** Staff id recorded in waiters[]; omit for guest/QR orders. */
  waiterId?: string;
  /** Present only for pickup orders. */
  pickup?: PickupDetails;
}

/**
 * The single place that persists customer orders. Every order-creation surface 
 * (Waiter POS, Table QR Ordering, Admin POS) calls this.
 */
export class OrderController {
  static async submitOrder(params: SubmitOrderParams): Promise<Result<Order>> {
    try {
      if (params.items.length === 0) {
        return { success: false, error: 'Cannot submit an empty order.' };
      }

      let orderId = params.existingOrderId || undefined;
      const branchId = params.branchId;

      if (params.orderType === 'dine-in' && !params.table) {
        return { success: false, error: 'Table selection is required for dine-in orders.' };
      }

      // A bill started offline exists only in this device's queue: further rounds
      // for that table go on the same bill, and wait in the queue behind it.
      const queuedOrders = OfflineSyncEngine.queuedNewOrders();
      if (!orderId && params.table) orderId = queuedOrders.find(o => o.table_id === params.table!.id)?.id;
      const billIsQueued = !!orderId && queuedOrders.some(o => o.id === orderId);
      let newOrderRow: any = null;

      // ── Create the order if one does not already exist ─────────────────────
      if (!orderId) {
        orderId = `order-${crypto.randomUUID()}`;

        const orderRow: any = {
          id: orderId,
          table_id: params.table?.id || null,
          // orders.table_number is NOT NULL in the schema, so takeaway/pickup
          // orders (which have no table) must use 0 as a sentinel rather than null.
          table_number: params.table?.number ?? 0,
          status: 'open',
          order_type: params.orderType,
          branch_id: branchId,
          waiters: params.waiterId ? [params.waiterId] : [],
          bill_number: null,
          subtotal: 0,
          tax: 0,
          total: 0,
        };

        // Pickup-specific fields (customer info, chosen method, payment state).
        if (params.pickup) {
          orderRow.pickup_method   = params.pickup.method;
          orderRow.pickup_status   = 'preparing';
          orderRow.pickup_pay_type = params.pickup.payType;
          orderRow.customer_name   = params.pickup.customerName;
          orderRow.customer_phone  = params.pickup.customerPhone;
          orderRow.customer_email  = params.pickup.customerEmail || null;
          orderRow.payment_status  = params.pickup.paymentStatus;
          orderRow.payment_receipt_url = params.pickup.receiptUrl || null;
        }

        try {
          if (!navigator.onLine) throw new TypeError('Offline');
          // takeaway & pickup get a bill number on creation (no table to key off).
          if (params.orderType !== 'dine-in') {
            orderRow.bill_number = await this.nextBillNumber(branchId, params.orderType);
          }
          const { error: orderError } = await supabase.from('orders').insert(orderRow);
          if (orderError) throw orderError;
        } catch (createErr) {
          if (!isNetworkError(createErr)) throw createErr;
          // No network: the queue creates this bill (and its bill number) on replay.
          newOrderRow = orderRow;
        }
        // The table is marked occupied AFTER items are inserted (below), so a
        // table never shows busy until an order is actually sent.
      }

      // ── Re-price + insert items SERVER-SIDE (migration 0022) ────────────────
      // The RPC ignores the client's prices entirely: it looks each line up from
      // `products` and each modifier from `modifier_options`, inserts the items
      // with those authoritative values, and rewrites the order total. This is
      // what stops a customer on the public QR/pickup page posting an item at an
      // arbitrary price. `rows` (client-priced) is kept ONLY as the offline
      // fallback (own-staff, reconciled on sync) and offline printing source.
      // The device picks each line's id (client_id) so an offline replay never adds a line twice.
      const lineIds = params.items.map(() => `item-${crypto.randomUUID()}`);
      const rpcItems = params.items.map((item, i) => ({
        product_id: item.productId,
        quantity: item.quantity,
        notes: item.notes || null,
        option_ids: (item.modifiers ?? []).map(m => m.optionId).filter(Boolean),
        client_id: lineIds[i],
      }));

      const rows = params.items.map((item, i) => ({
        id: lineIds[i],
        order_id: orderId,
        product_id: item.productId,
        product_name: item.productName,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.price * item.quantity,
        notes: item.notes || null,
        modifiers: item.modifiers ?? [],
        status: 'pending',
        added_by: params.addedBy,
        added_by_name: params.addedByName,
        station: item.station ?? 'kitchen',
        branch_id: branchId,
      }));

      const createdNewOrder = !params.existingOrderId;
      let finalOrder: any = null;
      let printItems: any[] = rows;
      let sentOnline = false;
      try {
        // A bill not on the server yet cannot take items directly: straight to the queue.
        if (newOrderRow || billIsQueued) throw new TypeError('Bill is queued offline');
        const { data: priced, error: rpcErr } = await supabase.rpc('submit_order_items', {
          p_order_id: orderId,
          p_branch_id: branchId,
          p_added_by: params.addedBy,
          p_added_by_name: params.addedByName,
          p_items: rpcItems,
        });
        if (rpcErr) throw rpcErr;

        // Print the SERVER-priced items (product_name → productName for the ticket).
        printItems = (priced ?? []).map((r: any) => ({ ...r, productName: r.product_name }));
        sentOnline = true;

        // A dine-in table only becomes "occupied" once real items are sent — this
        // covers group orders, whose shared order is created empty on scan.
        if (params.table?.id) {
          await supabase.from('tables')
            .update({ status: 'occupied', current_order_id: orderId })
            .eq('id', params.table.id);
        }

        const { data: saved } = await supabase.from('orders').select('*, order_items(*)').eq('id', orderId).single();
        if (saved) finalOrder = mapOrder(saved);
      } catch (dbErr: any) {
        // Only queue offline when the device is genuinely offline. An ONLINE
        // failure (e.g. the RPC rejected an unavailable product) is a real error
        // to surface — not something to silently queue as if it succeeded.
        if (!isNetworkError(dbErr)) {
          console.error('[OrderController] submit_order_items failed', dbErr);
          if (createdNewOrder) {
            // Drop the empty order row we created a moment ago so a failed submit
            // doesn't leave a phantom open order/occupied table behind.
            await supabase.from('orders').delete().eq('id', orderId);
          }
          return { success: false, error: dbErr?.message || 'Failed to submit order.' };
        }
        console.warn('[OrderController] Offline detected, queuing order locally', dbErr);
        // Replayed through the same server function later (server prices, branch check).
        OfflineSyncEngine.addToQueue({
          orderId, branchId, addedBy: params.addedBy, addedByName: params.addedByName, items: rpcItems,
          newOrder: newOrderRow ?? undefined,
        });
        // camelCase copies too, for screens that list the returned items.
        finalOrder = {
          id: orderId, tableNumber: params.table?.number || 0,
          orderType: params.orderType, billNumber: newOrderRow?.bill_number ?? null,
          items: rows.map(r => ({ ...r, productId: r.product_id, productName: r.product_name })),
        };
        printItems = rows;
      }

      if (!finalOrder) return { success: false, error: 'Failed to process order.' };

      const printers = cachedPrinters(branchId).filter((p: any) => p.isActive && p.type === 'network' && p.ipAddress);
      if (sentOnline) {
        // Online, the print station (the cashier tablet on the printers' network, migration 0048)
        // prints the tickets, so this phone can be on any internet. Warn if nothing printed.
        if (printers.length) {
          setTimeout(async () => {
            const { data } = await supabase.from('order_items').select('id').in('id', lineIds).is('printed_at', null);
            if (data?.length) toast.warning('The kitchen ticket has not printed yet. Is the cashier tablet on, with Print station switched on?', { duration: 10000 });
          }, 30_000);
        }
      } else if (printers.length) {
        // Offline: no station can see this order yet, so print straight to the printers when this
        // device can reach them; the queue then tells the server these lines are already printed.
        void OrderController.printOffline(orderId, printers, finalOrder, printItems, !createdNewOrder);
      }

      return { success: true, data: finalOrder };
    } catch (err: any) {
      console.error('[OrderController.submitOrder]', err);
      return { success: false, error: err?.message || 'Failed to submit order.' };
    }
  }

  /**
   * Void a single item that's already been sent to the kitchen (e.g. a
   * mis-order or a guest changed their mind). Only allowed while the parent
   * order is still open — an item on an already-paid bill can't be voided
   * here. Recomputes the order's subtotal/total excluding cancelled items,
   * the same way submitOrder does when items are added.
   */
  static async voidItem(
    itemId: string,
    orderId: string,
    reason: string | undefined,
    actor: { id: string; name: string },
    branchId: string,
  ): Promise<Result<void>> {
    // Server checks (migration 0033): bill still open, item not paid or already
    // voided; marks it cancelled with who/why and recomputes the bill.
    const { error } = await supabase.rpc('void_order_item', {
      p_item_id: itemId, p_order_id: orderId, p_branch_id: branchId,
      p_reason: reason ?? null, p_actor_id: actor.id, p_actor_name: actor.name,
    });
    if (error) return { success: false, error: error.message };
    // The print station prints the CANCELLED ticket at the item's station (migration 0048).
    return { success: true, data: undefined };
  }

  /** Offline order: kitchen tickets straight from this device (only works on the printers'
   *  network). Lines whose station printed are marked in the offline queue as printed. */
  private static async printOffline(orderId: string, printers: any[], order: any, items: any[], addOn: boolean) {
    const byStation: Record<string, any[]> = {};
    for (const it of items) (byStation[it.station || 'kitchen'] ??= []).push(it);
    const printed: string[] = [];
    await Promise.all(Object.entries(byStation).map(async ([station, stationItems]) => {
      let ok = false;
      for (const p of printers.filter(p => (p.stations?.length ? p.stations : ['kitchen']).includes(station))) {
        const res = await PrintService.sendToPrinter({
          printerIp: p.ipAddress, printerPort: p.port || 9100,
          bytes: PrintService.render(PrintService.formatKitchenTicket(order, stationItems, station, addOn), p.paperWidth),
        });
        ok ||= res.success;
      }
      if (ok) printed.push(...stationItems.map(i => i.id));
    }));
    if (printed.length) OfflineSyncEngine.markPrinted(orderId, printed);
  }

  /** Next zero-padded bill number for a branch, per order type. Uses the atomic
   *  server-side counter (migration 0021) so two concurrent orders can never
   *  receive the same number, instead of the old racy MAX(bill_number)+1. */
  private static async nextBillNumber(branchId: string, orderType: string = 'takeaway'): Promise<string> {
    const { data, error } = await supabase.rpc('next_bill_number', {
      p_branch_id: branchId,
      p_order_type: orderType,
    });
    if (error) throw error;
    return String(data);
  }
}
