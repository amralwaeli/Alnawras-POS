import { Order, Result } from '../models/types';
import { mapOrder } from '../models/mappers';
import { supabase } from '../../lib/supabase';
import { PrintService } from '../services/PrintService';

export interface SubmitOrderItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  notes?: string;
  station?: string;
}

export interface SubmitOrderParams {
  branchId: string;
  orderType: 'dine-in' | 'takeaway';
  /** Required for dine-in; null/omitted for takeaway. */
  table?: { id: string; number: number } | null;
  /** Reuse an already-open order if known. */
  existingOrderId?: string | null;
  items: SubmitOrderItem[];
  addedBy: string;
  addedByName: string;
  /** Staff id recorded in waiters[]; omit for guest/QR orders. */
  waiterId?: string;
}

/**
 * The single place that persists customer orders. Every order-creation surface
 * (staff table view, staff order-entry, customer QR) goes through submitOrder so
 * the money-touching write path lives in one auditable spot.
 */
export class OrderController {
  static async submitOrder(params: SubmitOrderParams): Promise<Result<Order>> {
    const { branchId, orderType, table, items, addedBy, addedByName, waiterId } = params;

    if (!items || items.length === 0) {
      return { success: false, error: 'Add items before submitting the order.' };
    }
    if (orderType === 'dine-in' && !table) {
      return { success: false, error: 'A table is required for dine-in orders.' };
    }

    try {
      let orderId = params.existingOrderId || undefined;

      // ── Create the order if one does not already exist ───────────────────────
      if (!orderId) {
        orderId = `order-${Date.now()}`;

        // dine-in: atomically reserve the table, recovering the winner on a race.
        if (orderType === 'dine-in' && table) {
          const { data: reserved } = await supabase
            .from('tables')
            .update({ status: 'occupied', current_order_id: orderId })
            .eq('id', table.id)
            .is('current_order_id', null)
            .select('current_order_id')
            .maybeSingle();

          if (!reserved?.current_order_id) {
            const { data: fresh } = await supabase
              .from('tables').select('current_order_id').eq('id', table.id).maybeSingle();
            if (fresh?.current_order_id) orderId = fresh.current_order_id;
          }
        }

        // Only insert a fresh order row if we still hold a brand-new id.
        const { data: existing } = await supabase
          .from('orders').select('id').eq('id', orderId).maybeSingle();

        if (!existing) {
          const billNumber = orderType === 'takeaway'
            ? await OrderController.nextBillNumber(branchId)
            : null;

          const { error: createError } = await supabase.from('orders').insert([{
            id: orderId,
            table_id: orderType === 'dine-in' ? table!.id : null,
            table_number: orderType === 'dine-in' ? table!.number : 0,
            subtotal: 0, tax: 0, discount: 0, total: 0,
            status: 'open', payment_status: 'unpaid', order_type: orderType,
            branch_id: branchId,
            waiters: waiterId ? [waiterId] : [],
            ...(billNumber ? { bill_number: billNumber } : {}),
          }]);
          if (createError) return { success: false, error: createError.message };
        }
      }

      // ── Insert the new items (branch_id is required for realtime fan-out) ─────
      const rows = items.map(it => ({
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        order_id: orderId,
        product_id: it.productId,
        product_name: it.productName,
        quantity: it.quantity,
        price: it.price,
        subtotal: it.price * it.quantity,
        status: 'pending',
        notes: it.notes || null,
        added_by: addedBy,
        added_by_name: addedByName,
        station: it.station ?? 'kitchen',
        sent_to_kitchen: true,
        branch_id: branchId,
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(rows);
      if (itemsError) return { success: false, error: itemsError.message };

      // ── Recompute + persist totals from the full item set ────────────────────
      const { data: allItems } = await supabase
        .from('order_items').select('subtotal').eq('order_id', orderId);
      const subtotal = (allItems || []).reduce((s, r: any) => s + Number(r.subtotal), 0);
      const tax = 0;
      await supabase.from('orders').update({ subtotal, tax, total: subtotal + tax }).eq('id', orderId);

      // ── Return the saved, mapped order ───────────────────────────────────────
      const { data: saved } = await supabase
        .from('orders').select('*, order_items(*)').eq('id', orderId).single();
      if (!saved) return { success: false, error: 'Order saved but could not be reloaded.' };
      
      const finalOrder = mapOrder(saved);

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

  /** Next zero-padded takeaway bill number for a branch. */
  private static async nextBillNumber(branchId: string): Promise<string> {
    const { data: lastBill } = await supabase
      .from('orders')
      .select('bill_number')
      .eq('branch_id', branchId)
      .eq('order_type', 'takeaway')
      .not('bill_number', 'is', null)
      .order('bill_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastNum = lastBill?.bill_number ? parseInt(lastBill.bill_number, 10) : 0;
    return String(lastNum + 1).padStart(4, '0');
  }
}
