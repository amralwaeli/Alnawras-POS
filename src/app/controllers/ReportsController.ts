import { supabase } from '../../lib/supabase';

export interface ProductSaleRow {
  productId: string;
  productName: string;
  unitsSold: number;
  revenue: number;
}

export interface SalesSummary {
  revenue: number; tax: number; discount: number; orders: number; items: number; expenses: number;
  byMethod: Record<string, number>;
  byType: Record<string, number>;
  byDay: { day: string; revenue: number; orders: number }[];
}

export interface CompletedOrderRow {
  id: string; billNumber: string | null; tableNumber: number; orderType: string;
  total: number; paymentMethod: string | null; completedAt: Date;
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

  /** Bills paid in [from, to), newest first (capped; the summary above has the totals). */
  static async getCompletedOrders(branchId: string, from: Date, to: Date, limit = 300): Promise<{ success: boolean; data?: CompletedOrderRow[]; error?: string }> {
    const { data, error } = await supabase
      .from('orders')
      .select('id, bill_number, table_number, order_type, total, payment_method, completed_at')
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
      })),
    };
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
