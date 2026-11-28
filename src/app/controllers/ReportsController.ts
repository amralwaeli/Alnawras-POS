import { supabase } from '../../lib/supabase';

export interface ProductSaleRow {
  productId: string;
  productName: string;
  unitsSold: number;
  revenue: number;
}

export interface SalesSummary {
  revenue: number; tax: number; discount: number; orders: number; items: number; expenses: number;
  /** Money refunded in the period (migration 0059); revenue stays gross. */
  refunds: number; refundsByMethod: Record<string, number>;
  byMethod: Record<string, number>;
  byType: Record<string, number>;
  byDay: { day: string; revenue: number; orders: number }[];
}

export interface CompletedOrderRow {
  id: string; billNumber: string | null; tableNumber: number; orderType: string;
  total: number; paymentMethod: string | null; completedAt: Date;
  cashierName: string | null; takenBy: string;
}

export interface BillDetail {
  billNumber: string | null; tableNumber: number; orderType: string; completedAt: Date | null;
  paymentMethod: string | null; cashierName: string | null;
  subtotal: number; discount: number; tax: number; total: number;
  items: { id: string; refundId: string | null; productName: string; quantity: number; amount: number; modifiers: string; addedBy: string | null;
    cancelled: boolean; cancelledBy: string | null; cancelReason: string | null }[];
  payments: { method: string; amount: number; cashierName: string | null; at: Date }[];
  refunds: { amount: number; method: string; reason: string; by: string | null; at: Date }[];
}

export type RefundMethod = 'cash' | 'card' | 'qr' | 'account';

/** Distinct names of who added the bill's live (not cancelled) items, e.g. "wadeea, waqar". */
export function takenByNames(items: { added_by_name?: string | null; status?: string | null }[] | null | undefined): string {
  const names = [...new Set((items ?? []).filter(i => i.status !== 'cancelled').map(i => i.added_by_name?.trim()).filter(Boolean))];
  return names.length ? names.join(', ') : 'Guest / QR';
}

/** Distinct cashiers who took the bill's payments (orders.cashier_name is never written), or null. */
export function cashierNames(payments: { cashier_name?: string | null }[] | null | undefined): string | null {
  const names = [...new Set((payments ?? []).map(p => p.cashier_name?.trim()).filter(Boolean))];
  return names.length ? names.join(', ') : null;
}

export class ReportsController {
  /** Totals for bills PAID in [from, to) (migration 0033), plus expenses dated
   *  in the same range — computed in the database, never from the live POS list. */
  static async getSalesSummary(branchId: string, from: Date, to: Date): Promise<{ success: boolean; data?: SalesSummary; error?: string }> {
    const { data, error } = await supabase.rpc('get_sales_summary', {
      p_branch_id: branchId, p_from: from.toISOString(), p_to: to.toISOString(),
      p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if (error) return { success: false, error: error.message };
    const num = (v: any) => Number(v ?? 0);
    const nums = (o: any) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, num(v)]));
    return {
      success: true,
      data: {
        revenue: num(data.revenue), tax: num(data.tax), discount: num(data.discount),
        orders: num(data.orders), items: num(data.items), expenses: num(data.expenses),
        refunds: num(data.refunds), refundsByMethod: nums(data.refunds_by_method),
        byMethod: nums(data.by_method), byType: nums(data.by_type),
        byDay: (data.by_day ?? []).map((d: any) => ({ day: d.day, revenue: num(d.revenue), orders: num(d.orders) })),
      },
    };
  }

  /** Detailed reports for [from, to) in one call (migration 0047): by hour, category, staff,
   *  cashier, table, discounts and cancellations. Raw JSON; the reports screen reads it. */
  static async getDetailReport(branchId: string, from: Date, to: Date): Promise<{ success: boolean; data?: any; error?: string }> {
    const { data, error } = await supabase.rpc('get_detail_report', {
      p_branch_id: branchId, p_from: from.toISOString(), p_to: to.toISOString(),
      p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }

  /** Bills paid in [from, to), newest first (capped; the summary above has the totals).
   *  withStaff embeds each bill's item names/status (two columns) for the "Taken by" column. */
  static async getCompletedOrders(branchId: string, from: Date, to: Date, limit = 300, withStaff = false): Promise<{ success: boolean; data?: CompletedOrderRow[]; error?: string }> {
    const { data, error } = await supabase
      .from('orders')
      .select('id, bill_number, table_number, order_type, total, payment_method, completed_at, cashier_name'
        + (withStaff ? ', order_items(added_by_name, status), order_payments(cashier_name)' : ''))
      .eq('branch_id', branchId).eq('status', 'completed')
      .gte('completed_at', from.toISOString()).lt('completed_at', to.toISOString())
      .order('completed_at', { ascending: false })
      .limit(limit);
    if (error) return { success: false, error: error.message };
    return {
      success: true,
      data: (data ?? []).map((r: any) => ({
        id: r.id, billNumber: r.bill_number, tableNumber: r.table_number, orderType: r.order_type ?? 'dine-in',
        total: Number(r.total ?? 0), paymentMethod: r.payment_method, completedAt: new Date(r.completed_at),
        cashierName: r.cashier_name || (withStaff ? cashierNames(r.order_payments) : null), takenBy: withStaff ? takenByNames(r.order_items) : '',
      })),
    };
  }

  /** One paid bill in full (items + payments), loaded when the owner opens it in Reports. */
  static async getBillDetail(orderId: string): Promise<{ success: boolean; data?: BillDetail; error?: string }> {
    const { data: r, error } = await supabase
      .from('orders')
      .select('bill_number, table_number, order_type, completed_at, payment_method, cashier_name, subtotal, discount, tax, total, '
        + 'order_items(id, refund_id, product_name, quantity, price, subtotal, modifiers, added_by_name, status, cancelled_by_name, cancel_reason), '
        + 'order_payments(method, amount, cashier_name, created_at), '
        + 'refunds(amount, method, reason, refunded_by_name, created_at)')
      .eq('id', orderId).single();
    if (error) return { success: false, error: error.message };
    const o: any = r;
    return {
      success: true,
      data: {
        billNumber: o.bill_number, tableNumber: o.table_number, orderType: o.order_type ?? 'dine-in',
        completedAt: o.completed_at ? new Date(o.completed_at) : null,
        paymentMethod: o.payment_method, cashierName: o.cashier_name || cashierNames(o.order_payments),
        subtotal: Number(o.subtotal ?? 0), discount: Number(o.discount ?? 0), tax: Number(o.tax ?? 0), total: Number(o.total ?? 0),
        items: (o.order_items ?? []).map((i: any) => ({
          id: i.id, refundId: i.refund_id ?? null, productName: i.product_name, quantity: Number(i.quantity ?? 1),
          amount: Number(i.subtotal ?? Number(i.price ?? 0) * Number(i.quantity ?? 1)),
          modifiers: (Array.isArray(i.modifiers) ? i.modifiers : []).map((m: any) => m.optionName ?? m.option_name ?? '').filter(Boolean).join(', '),
          addedBy: i.added_by_name ?? null, cancelled: i.status === 'cancelled',
          cancelledBy: i.cancelled_by_name ?? null, cancelReason: i.cancel_reason ?? null,
        })),
        payments: (o.order_payments ?? [])
          .map((p: any) => ({ method: p.method, amount: Number(p.amount ?? 0), cashierName: p.cashier_name ?? null, at: new Date(p.created_at) }))
          .sort((a: any, b: any) => a.at.getTime() - b.at.getTime()),
        refunds: (o.refunds ?? [])
          .map((f: any) => ({ amount: Number(f.amount ?? 0), method: f.method, reason: f.reason ?? '', by: f.refunded_by_name ?? null, at: new Date(f.created_at) }))
          .sort((a: any, b: any) => a.at.getTime() - b.at.getTime()),
      },
    };
  }

  /** Refund a paid bill (migration 0059): itemIds null = everything not yet refunded.
   *  The server works out the amount (share of the bill total) and blocks double refunds. */
  static async refundBill(p: { branchId: string; orderId: string; itemIds: string[] | null; method: RefundMethod; reason: string; actorId: string; actorName: string }):
    Promise<{ success: boolean; data?: { refundId: string; amount: number; itemIds: string[] }; error?: string }> {
    const { data, error } = await supabase.rpc('refund_order', {
      p_branch_id: p.branchId, p_order_id: p.orderId, p_item_ids: p.itemIds, p_method: p.method,
      p_reason: p.reason, p_actor_id: p.actorId, p_actor_name: p.actorName,
    });
    if (error) return { success: false, error: error.message };
    return { success: true, data: { refundId: data.refund_id, amount: Number(data.amount ?? 0), itemIds: data.item_ids ?? [] } };
  }

  /**
   * Units sold + revenue per product, for completed orders in [dateFrom, dateTo).
   * Aggregated server-side via the get_product_sales RPC (migration 0016) —
   * never pulls raw order_items into the browser to compute this.
   */
  static async getProductSales(
    branchId: string,
    dateFrom: Date,
    dateTo: Date
  ): Promise<{ success: boolean; data?: ProductSaleRow[]; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_product_sales', {
        p_branch_id: branchId,
        p_date_from: dateFrom.toISOString(),
        p_date_to: dateTo.toISOString(),
      });
      if (error) throw error;
      const rows: ProductSaleRow[] = (data ?? []).map((r: any) => ({
        productId: r.product_id,
        productName: r.product_name,
        unitsSold: Number(r.units_sold ?? 0),
        revenue: Number(r.revenue ?? 0),
      }));
      return { success: true, data: rows };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to load product sales' };
    }
  }
}
