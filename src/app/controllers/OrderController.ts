import { Order, OrderItem, Product, User, Table } from '../models/types';
import { AuthController } from './AuthController';
import {
  calculateSubtotal,
  calculateTotalTax,
  calculateOrderTotal,
} from '../models/businessLogic';

export class OrderController {
  /**
   * Create new order for a table (Waiter only)
   */
  static createOrder(
    tables: Table[],
    tableId: string,
    user: User
  ): {
    success: boolean;
    order?: Order;
    error?: string;
  } {
    if (!AuthController.hasPermission(user, 'canAddOrders')) {
      return { success: false, error: 'Unauthorized: Cannot create orders' };
    }

    const table = tables.find(t => t.id === tableId);
    if (!table) return { success: false, error: 'Table not found' };

    if (table.status === 'occupied' && table.currentOrderId) {
      return { success: false, error: 'Table already has an active order' };
    }

    const order: Order = {
      id: `order-${Date.now()}`,
      tableId,
      tableNumber: table.number,
      items: [],
      subtotal: 0,
      tax: 0,
      discount: 0,
      total: 0,
      status: 'open',
      createdAt: new Date(),
      waiters: [user.id],
    };

    return { success: true, order };
  }

  /**
   * Add item to order (Waiter only)
   */
  static addItemToOrder(
    orders: Order[],
    orderId: string,
    product: Product,
    quantity: number,
    user: User,
    products: Product[],
    notes?: string
  ): {
    success: boolean;
    orders?: Order[];
    error?: string;
  } {
    if (!AuthController.hasPermission(user, 'canAddOrders')) {
      return { success: false, error: 'Unauthorized: Cannot add items' };
    }

    const order = orders.find(o => o.id === orderId);
    if (!order || order.status !== 'open') {
      return { success: false, error: 'Order not found or closed' };
    }

    const status = product.availabilityStatus || product.kitchenStatus || 'available';
    if (status !== 'available') {
      return { success: false, error: `${product.name} is ${status}` };
    }

    const newItem: OrderItem = {
      id: `item-${Date.now()}`,
      productId: product.id,
      productName: product.name,
      quantity,
      price: product.price,
      subtotal: product.price * quantity,
      addedBy: user.id,
      addedByName: user.name,
      addedAt: new Date(),
      station: product.station || 'kitchen',
      status: 'pending',
      notes,
    };

    const updatedOrders = orders.map(o => {
      if (o.id === orderId) {
        const newItems = [...o.items, newItem];
        const subtotal = calculateSubtotal(newItems);
        const tax = calculateTotalTax(newItems, products);
        const total = calculateOrderTotal(subtotal, tax, o.discount);
        const waiters = o.waiters.includes(user.id) ? o.waiters : [...o.waiters, user.id];
        return { ...o, items: newItems, subtotal, tax, total, waiters };
      }
      return o;
    });

    return { success: true, orders: updatedOrders };
  }

  /**
   * Remove item from order
   */
  static removeItemFromOrder(
    orders: Order[],
    orderId: string,
    itemId: string,
    user: User,
    products: Product[]
  ): {
    success: boolean;
    orders?: Order[];
    error?: string;
  } {
    const order = orders.find(o => o.id === orderId);
    if (!order || order.status !== 'open') return { success: false, error: 'Invalid operation' };

    const item = order.items.find(i => i.id === itemId);
    if (!item) return { success: false, error: 'Item not found' };

    if (user.role !== 'admin' && item.addedBy !== user.id) {
      return { success: false, error: 'Unauthorized' };
    }

    const updatedOrders = orders.map(o => {
      if (o.id === orderId) {
        const newItems = o.items.filter(i => i.id !== itemId);
        const subtotal = calculateSubtotal(newItems);
        const tax = calculateTotalTax(newItems, products);
        const total = calculateOrderTotal(subtotal, tax, o.discount);
        return { ...o, items: newItems, subtotal, tax, total };
      }
      return o;
    });

    return { success: true, orders: updatedOrders };
  }

  /**
   * Update item status (Kitchen OR Juice OR Admin)
   */
  static updateItemStatus(
    orders: Order[],
    orderId: string,
    itemId: string,
    status: OrderItem['status'],
    user: User
  ): {
    success: boolean;
    orders?: Order[];
    error?: string;
  } {
    const allowed = ['kitchen', 'juice', 'admin'];
    if (!allowed.includes(user.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    const updatedOrders = orders.map(o => {
      if (o.id === orderId) {
        return {
          ...o,
          items: o.items.map(i => i.id === itemId ? { ...i, status } : i),
        };
      }
      return o;
    });

    return { success: true, orders: updatedOrders };
  }

  static applyDiscount(orders: Order[], orderId: string, discount: number, user: User, products: Product[]) {
    if (user.role !== 'admin') return { success: false, error: 'Admin only' };
    const updatedOrders = orders.map(o => {
      if (o.id === orderId) {
        const total = calculateOrderTotal(o.subtotal, o.tax, discount);
        return { ...o, discount, total };
      }
      return o;
    });
    return { success: true, orders: updatedOrders };
  }
}