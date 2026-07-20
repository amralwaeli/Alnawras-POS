import { supabase } from '../../lib/supabase';

export interface ProductSaleRow {
  productId: string;
  productName: string;
  unitsSold: number;
  revenue: number;
}

export class ReportsController {
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
