import { Order, Result } from '../models/types';
import { mapOrder } from '../models/mappers';
import { supabase } from '../../lib/supabase';
import { PrintService } from '../services/PrintService';
import { OfflineSyncEngine } from '../services/OfflineSyncEngine';

export interface SubmitOrderItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  notes?: string;
  station?: 'kitchen' | 'juice' | 'shawarma' | 'none';
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

      // ── Create the order if one does not already exist ─────────────────────
      if (!orderId) {
        orderId = `order-${Date.now()}`;
        // takeaway & pickup get a bill number on creation (no table to key off).
        const billNum = params.orderType !== 'dine-in'
          ? await this.nextBillNumber(branchId, params.orderType)
          : null;

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
          bill_number: billNum,
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

        const { error: orderError } = await supabase.from('orders').insert(orderRow);
        if (orderError) throw orderError;
        // The table is marked occupied AFTER items are inserted (below), so a
        // table never shows busy until an order is actually sent.
      }

      // ── Insert the new order items ──────────────────────────────────────────
      const rows = params.items.map(item => ({
        id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        order_id: orderId,
        product_id: item.productId,
        product_name: item.productName,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.price * item.quantity,
        notes: item.notes || null,
        status: 'pending',
        added_by: params.addedBy,
        added_by_name: params.addedByName,
        station: item.station ?? 'kitchen',
        branch_id: branchId,
      }));

      // ── Attempt Database Sync ─────────────────────────────────────────────
      let finalOrder: any = null;
      try {
        const { error: itemsError } = await supabase.from('order_items').insert(rows);
        if (itemsError) throw itemsError;

        // Update Order Totals
        const { data: allItems } = await supabase.from('order_items').select('subtotal').eq('order_id', orderId);
        const subtotal = (allItems || []).reduce((s, r: any) => s + Number(r.subtotal), 0);
        const tax = 0;
        await supabase.from('orders').update({ subtotal, tax, total: subtotal + tax }).eq('id', orderId);

        // A dine-in table only becomes "occupied" once real items are sent — this
        // covers group orders, whose shared order is created empty on scan.
        if (params.table?.id) {
          await supabase.from('tables')
            .update({ status: 'occupied', current_order_id: orderId })
            .eq('id', params.table.id);
        }

        const { data: saved } = await supabase.from('orders').select('*, order_items(*)').eq('id', orderId).single();
        if (saved) finalOrder = mapOrder(saved);
      } catch (dbErr) {
        console.warn('[OrderController] Offline detected, queuing order locally', dbErr);
        // Queue for background sync
        OfflineSyncEngine.addToQueue('order', { order: { id: orderId, branch_id: branchId, status: 'open' }, items: rows });
        // Create a temporary order object for printing
        finalOrder = { id: orderId, tableNumber: params.table?.number || 0, items: rows };
      }

      if (!finalOrder) return { success: false, error: 'Failed to process order.' };

      // ── AUTOMATED STATION-BASED PRINTING ──
      // Split items by station and send to respective printers
      try {
        const printersRaw = localStorage.getItem('alnawras_printers');
        if (printersRaw) {
          const printers = JSON.parse(printersRaw);
          const activePrinters = printers.filter((p: any) => p.isActive && p.type === 'network');
          
          // Group rows (new items) by their station
          const itemsByStation: Record<string, any[]> = {};
          rows.forEach(item => {
            const station = item.station || 'kitchen';
            if (!itemsByStation[station]) itemsByStation[station] = [];
            itemsByStation[station].push(item);
          });

          // Send to each printer that covers the station
          for (const printer of activePrinters) {
            // A printer might cover multiple stations (e.g. 'kitchen' and 'shawarma')
            const printerStations = printer.stations || ['kitchen']; 
            
            for (const station of printerStations) {
              const stationItems = itemsByStation[station];
              if (stationItems && stationItems.length > 0) {
                const ticket = PrintService.formatKitchenTicket(finalOrder, stationItems, station);
                await PrintService.sendToPrinter({
                  printerIp: printer.ipAddress,
                  printerPort: printer.port || 9100,
                  content: ticket
                });
              }
            }
          }
        }
      } catch (printErr) {
        console.warn('[AutoPrint] Failed to dispatch to station printers', printErr);
      }
      // -------------------------------

      return { success: true, data: finalOrder };
    } catch (err: any) {
      console.error('[OrderController.submitOrder]', err);
      return { success: false, error: err?.message || 'Failed to submit order.' };
    }
  }

  /** Next zero-padded bill number for a branch, per order type. */
  private static async nextBillNumber(branchId: string, orderType: string = 'takeaway'): Promise<string> {
    const { data: lastBill } = await supabase
      .from('orders')
      .select('bill_number')
      .eq('branch_id', branchId)
      .eq('order_type', orderType)
      .not('bill_number', 'is', null)
      .order('bill_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastNum = lastBill?.bill_number ? parseInt(lastBill.bill_number, 10) : 0;
    return String(lastNum + 1).padStart(4, '0');
  }
}
