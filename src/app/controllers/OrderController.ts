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
      return {
        success: false,
        error: 'Unauthorized: Cannot create orders',
      };
    }

    const table = tables.find(t => t.id === tableId);
    if (!table) {
      return {
        success: false,
        error: 'Table not found',
      };
    }

    if (table.status === 'occupied' && table.currentOrderId) {
      return {
        success: false,
        error: 'Table already has an active order',
      };
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
      waiters: [],
    };

    return {
      success: true,
      order,
    };
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
      return {
        success: false,
        error: 'Unauthorized: Cannot add items to orders',
      };
    }

    const order = orders.find(o => o.id === orderId);
    if (!order) {
      return {
        success: false,
        error: 'Order not found',
      };
    }

    if (order.status !== 'open') {
      return {
        success: false,
        error: 'Cannot add items to completed order',
      };
    }

    // Check if product is available (not marked finished/out-of-stock by kitchen)
    if (product.kitchenStatus === 'finished' || product.kitchenStatus === 'out-of-stock') {
      return {
        success: false,
        error: `${product.name} is currently ${product.kitchenStatus}`,
      };
    }

    // Check stock availability
    if (product.stock < quantity) {
      return {
        success: false,
        error: `Insufficient stock for ${product.name}. Available: ${product.stock}`,
      };
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
      status: 'pending',
      notes,
    };

    const updatedOrders = orders.map(o => {
      if (o.id === orderId) {
        const newItems = [...o.items, newItem];
        const subtotal = calculateSubtotal(newItems);
        const tax = calculateTotalTax(newItems, products);
        const total = calculateOrderTotal(subtotal, tax, o.discount);

        const waiters = o.waiters.includes(user.id)
          ? o.waiters
          : [...o.waiters, user.id];

        return {
          ...o,
          items: newItems,
          subtotal,
          tax,
          total,
          waiters,
        };
      }
      return o;
    });

    return {
      success: true,
      orders: updatedOrders,
    };
  }

  /**
   * Remove item from order (Waiter who added it or Admin)
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
    if (!order) {
      return {
        success: false,
        error: 'Order not found',
      };
    }

    const item = order.items.find(i => i.id === itemId);
    if (!item) {
      return {
        success: false,
        error: 'Item not found',
      };
    }

    // Only the waiter who added it or admin can remove it
    if (user.role !== 'admin' && item.addedBy !== user.id) {
      return {
        success: false,
        error: 'Unauthorized: Can only remove items you added',
      };
    }

    if (order.status !== 'open') {
      return {
        success: false,
        error: 'Cannot modify completed order',
      };
    }

    const updatedOrders = orders.map(o => {
      if (o.id === orderId) {
        const newItems = o.items.filter(i => i.id !== itemId);
        const subtotal = calculateSubtotal(newItems);
        const tax = calculateTotalTax(newItems, products);
        const total = calculateOrderTotal(subtotal, tax, o.discount);

        return {
          ...o,
          items: newItems,
          subtotal,
          tax,
          total,
        };
      }
      return o;
    });

    return {
      success: true,
      orders: updatedOrders,
    };
  }

  /**
   * Update item status (Kitchen role)
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
    if (user.role !== 'kitchen' && user.role !== 'admin') {
      return {
        success: false,
        error: 'Unauthorized: Only kitchen staff can update item status',
      };
    }

    const updatedOrders = orders.map(o => {
      if (o.id === orderId) {
        return {
          ...o,
          items: o.items.map(i =>
            i.id === itemId ? { ...i, status } : i
          ),
        };
      }
      return o;
    });

    return {
      success: true,
      orders: updatedOrders,
    };
  }

  /**
   * Get order by ID
   */
  static getOrderById(orders: Order[], orderId: string): Order | undefined {
    return orders.find(o => o.id === orderId);
  }

  /**
   * Get orders by table
   */
  static getOrdersByTable(orders: Order[], tableId: string): Order[] {
    return orders.filter(o => o.tableId === tableId);
  }

  /**
   * Get open orders
   */
  static getOpenOrders(orders: Order[]): Order[] {
    return orders.filter(o => o.status === 'open');
  }

  /**
   * Apply discount to order (Admin only)
   */
  static applyDiscount(
    orders: Order[],
    orderId: string,
    discountAmount: number,
    user: User,
    products: Product[]
  ): {
    success: boolean;
    orders?: Order[];
    error?: string;
  } {
    if (user.role !== 'admin') {
      return {
        success: false,
        error: 'Unauthorized: Only admin can apply discounts',
      };
    }

    const order = orders.find(o => o.id === orderId);
    if (!order) {
      return {
        success: false,
        error: 'Order not found',
      };
    }

    if (discountAmount < 0 || discountAmount > order.subtotal) {
      return {
        success: false,
        error: 'Invalid discount amount',
      };
    }

    const updatedOrders = orders.map(o => {
      if (o.id === orderId) {
        const total = calculateOrderTotal(o.subtotal, o.tax, discountAmount);
        return {
          ...o,
          discount: discountAmount,
          total,
        };
      }
      return o;
    });

    return {
      success: true,
      orders: updatedOrders,
    };
  }
}
