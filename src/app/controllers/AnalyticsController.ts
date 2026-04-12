import { Order, Product, SalesAnalytics } from '../models/types';
import { calculateSalesAnalytics } from '../models/businessLogic';

export class AnalyticsController {
  /**
   * Get comprehensive sales report
   */
  static getSalesReport(
    orders: Order[],
    products: Product[],
    startDate?: Date,
    endDate?: Date
  ): SalesAnalytics {
    let filteredOrders = orders;

    if (startDate || endDate) {
      filteredOrders = orders.filter(order => {
        const orderDate = order.createdAt;
        if (startDate && orderDate < startDate) return false;
        if (endDate && orderDate > endDate) return false;
        return true;
      });
    }

    return calculateSalesAnalytics(filteredOrders, products);
  }

  /**
   * Get top selling products
   */
  static getTopProducts(orders: Order[], limit: number = 5): {
    productId: string;
    productName: string;
    quantitySold: number;
    revenue: number;
  }[] {
    const productSales: Record<string, { name: string; quantity: number; revenue: number }> = {};

    orders.forEach(order => {
      order.items.forEach(item => {
        if (!productSales[item.productId]) {
          productSales[item.productId] = {
            name: item.productName,
            quantity: 0,
            revenue: 0,
          };
        }
        productSales[item.productId].quantity += item.quantity;
        productSales[item.productId].revenue += item.subtotal;
      });
    });

    return Object.entries(productSales)
      .map(([productId, data]) => ({
        productId,
        productName: data.name,
        quantitySold: data.quantity,
        revenue: Math.round(data.revenue * 100) / 100,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  }

  /**
   * Get cashier performance
   */
  static getCashierPerformance(orders: Order[]): {
    cashierId: string;
    cashierName: string;
    totalSales: number;
    orderCount: number;
    averageOrderValue: number;
  }[] {
    const cashierStats: Record<string, {
      name: string;
      totalSales: number;
      orderCount: number;
    }> = {};

    orders.forEach(order => {
      if (!cashierStats[order.cashierId]) {
        cashierStats[order.cashierId] = {
          name: order.cashierName,
          totalSales: 0,
          orderCount: 0,
        };
      }
      cashierStats[order.cashierId].totalSales += order.total;
      cashierStats[order.cashierId].orderCount += 1;
    });

    return Object.entries(cashierStats)
      .map(([cashierId, stats]) => ({
        cashierId,
        cashierName: stats.name,
        totalSales: Math.round(stats.totalSales * 100) / 100,
        orderCount: stats.orderCount,
        averageOrderValue: Math.round((stats.totalSales / stats.orderCount) * 100) / 100,
      }))
      .sort((a, b) => b.totalSales - a.totalSales);
  }

  /**
   * Get revenue by time period
   */
  static getRevenueByPeriod(
    orders: Order[],
    period: 'hour' | 'day' | 'week' | 'month'
  ): {
    period: string;
    revenue: number;
    orders: number;
  }[] {
    const revenueMap: Record<string, { revenue: number; orders: number }> = {};

    orders.forEach(order => {
      let key: string;
      const date = order.createdAt;

      switch (period) {
        case 'hour':
          key = `${date.toLocaleDateString()} ${date.getHours()}:00`;
          break;
        case 'day':
          key = date.toLocaleDateString();
          break;
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = `Week of ${weekStart.toLocaleDateString()}`;
          break;
        case 'month':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
      }

      if (!revenueMap[key]) {
        revenueMap[key] = { revenue: 0, orders: 0 };
      }
      revenueMap[key].revenue += order.total;
      revenueMap[key].orders += 1;
    });

    return Object.entries(revenueMap)
      .map(([period, data]) => ({
        period,
        revenue: Math.round(data.revenue * 100) / 100,
        orders: data.orders,
      }))
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  /**
   * Get payment method breakdown
   */
  static getPaymentMethodBreakdown(orders: Order[]): {
    method: string;
    count: number;
    totalAmount: number;
    percentage: number;
  }[] {
    const methodStats: Record<string, { count: number; totalAmount: number }> = {};
    const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);

    orders.forEach(order => {
      if (!methodStats[order.paymentMethod]) {
        methodStats[order.paymentMethod] = { count: 0, totalAmount: 0 };
      }
      methodStats[order.paymentMethod].count += 1;
      methodStats[order.paymentMethod].totalAmount += order.total;
    });

    return Object.entries(methodStats)
      .map(([method, stats]) => ({
        method,
        count: stats.count,
        totalAmount: Math.round(stats.totalAmount * 100) / 100,
        percentage: totalRevenue > 0 ? Math.round((stats.totalAmount / totalRevenue) * 100 * 100) / 100 : 0,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }
}
