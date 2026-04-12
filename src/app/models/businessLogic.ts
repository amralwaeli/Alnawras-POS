import { Product, OrderItem, Order, SalesAnalytics } from './types';

/**
 * Calculate tax for an order item
 */
export function calculateItemTax(price: number, quantity: number, taxRate: number): number {
  return Math.round(price * quantity * taxRate * 100) / 100;
}

/**
 * Calculate subtotal for order items
 */
export function calculateSubtotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.subtotal, 0);
}

/**
 * Calculate total tax for an order
 */
export function calculateTotalTax(items: OrderItem[], products: Product[]): number {
  let totalTax = 0;

  items.forEach(item => {
    const product = products.find(p => p.id === item.productId);
    if (product) {
      totalTax += calculateItemTax(item.price, item.quantity, product.taxRate);
    }
  });

  return Math.round(totalTax * 100) / 100;
}

/**
 * Apply discount to subtotal
 */
export function applyDiscount(
  subtotal: number,
  discount: { type: 'percentage' | 'fixed', value: number }
): number {
  if (discount.type === 'percentage') {
    return Math.round(subtotal * (discount.value / 100) * 100) / 100;
  }
  return Math.min(discount.value, subtotal);
}

/**
 * Calculate order total
 */
export function calculateOrderTotal(
  subtotal: number,
  tax: number,
  discount: number
): number {
  return Math.round((subtotal + tax - discount) * 100) / 100;
}

/**
 * Validate stock availability for order
 */
export function validateStockAvailability(
  items: OrderItem[],
  products: Product[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  items.forEach(item => {
    const product = products.find(p => p.id === item.productId);
    if (!product) {
      errors.push(`Product ${item.productName} not found`);
    } else if (product.stock < item.quantity) {
      errors.push(`Insufficient stock for ${item.productName}. Available: ${product.stock}, Requested: ${item.quantity}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Update product stock after sale
 */
export function updateStockAfterSale(
  products: Product[],
  items: OrderItem[]
): Product[] {
  return products.map(product => {
    const orderItem = items.find(item => item.productId === product.id);
    if (orderItem) {
      return {
        ...product,
        stock: product.stock - orderItem.quantity,
      };
    }
    return product;
  });
}

/**
 * Calculate sales analytics from orders
 */
export function calculateSalesAnalytics(
  orders: Order[],
  products: Product[]
): SalesAnalytics {
  const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);
  const totalOrders = orders.length;
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Calculate items sold
  let itemsSold = 0;
  const productSales: Record<string, { name: string; quantity: number; revenue: number }> = {};

  orders.forEach(order => {
    order.items.forEach(item => {
      itemsSold += item.quantity;

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

  // Top products
  const topProducts = Object.entries(productSales)
    .map(([productId, data]) => ({
      productId,
      productName: data.name,
      quantitySold: data.quantity,
      revenue: data.revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Revenue by day
  const revenueByDayMap: Record<string, { revenue: number; orders: number }> = {};
  orders.forEach(order => {
    const dateKey = order.createdAt.toISOString().split('T')[0];
    if (!revenueByDayMap[dateKey]) {
      revenueByDayMap[dateKey] = { revenue: 0, orders: 0 };
    }
    revenueByDayMap[dateKey].revenue += order.total;
    revenueByDayMap[dateKey].orders += 1;
  });

  const revenueByDay = Object.entries(revenueByDayMap)
    .map(([date, data]) => ({
      date,
      revenue: Math.round(data.revenue * 100) / 100,
      orders: data.orders,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Revenue by category
  const categoryRevenue: Record<string, number> = {};
  orders.forEach(order => {
    order.items.forEach(item => {
      const product = products.find(p => p.id === item.productId);
      if (product) {
        if (!categoryRevenue[product.category]) {
          categoryRevenue[product.category] = 0;
        }
        categoryRevenue[product.category] += item.subtotal;
      }
    });
  });

  const revenueByCategory = Object.entries(categoryRevenue)
    .map(([category, revenue]) => ({
      category,
      revenue: Math.round(revenue * 100) / 100,
      percentage: Math.round((revenue / totalRevenue) * 100 * 100) / 100,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalOrders,
    averageOrderValue: Math.round(averageOrderValue * 100) / 100,
    itemsSold,
    topProducts,
    revenueByDay,
    revenueByCategory,
  };
}

/**
 * Check if product is low on stock
 */
export function isLowStock(product: Product): boolean {
  return product.stock <= product.reorderPoint;
}

/**
 * Get inventory status
 */
export function getInventoryStatus(product: Product): 'in-stock' | 'low-stock' | 'out-of-stock' {
  if (product.stock === 0) return 'out-of-stock';
  if (product.stock <= product.reorderPoint) return 'low-stock';
  return 'in-stock';
}
