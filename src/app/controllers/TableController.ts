import { Table, Order, User } from '../models/types';
import { AuthController } from './AuthController';

export class TableController {
  /**
   * Get all tables
   */
  static getTables(tables: Table[], user: User): {
    success: boolean;
    tables?: Table[];
    error?: string;
  } {
    if (!AuthController.hasPermission(user, 'canViewTables')) {
      return {
        success: false,
        error: 'Unauthorized: Cannot view tables',
      };
    }

    // Cashiers only see their assigned tables
    if (user.role === 'cashier') {
      return {
        success: true,
        tables: tables.filter(t => t.assignedCashierId === user.id),
      };
    }

    return {
      success: true,
      tables,
    };
  }

  /**
   * Get table by ID
   */
  static getTableById(
    tables: Table[],
    tableId: string,
    user: User
  ): Table | undefined {
    if (!AuthController.hasPermission(user, 'canViewTables')) {
      return undefined;
    }

    const table = tables.find(t => t.id === tableId);

    // Cashiers can only see their assigned tables
    if (user.role === 'cashier' && table?.assignedCashierId !== user.id) {
      return undefined;
    }

    return table;
  }

  /**
   * Get occupied tables
   */
  static getOccupiedTables(tables: Table[], user: User): Table[] {
    if (!AuthController.hasPermission(user, 'canViewTables')) {
      return [];
    }

    const occupied = tables.filter(t => t.status === 'occupied');

    if (user.role === 'cashier') {
      return occupied.filter(t => t.assignedCashierId === user.id);
    }

    return occupied;
  }

  /**
   * Get available tables
   */
  static getAvailableTables(tables: Table[]): Table[] {
    return tables.filter(t => t.status === 'available');
  }

  /**
   * Update table status
   */
  static updateTableStatus(
    tables: Table[],
    tableId: string,
    status: 'available' | 'occupied' | 'reserved',
    user: User,
    orderId?: string
  ): {
    success: boolean;
    tables?: Table[];
    error?: string;
  } {
    if (user.role !== 'admin' && user.role !== 'waiter') {
      return {
        success: false,
        error: 'Unauthorized: Only admin or waiter can update table status',
      };
    }

    const table = tables.find(t => t.id === tableId);
    if (!table) {
      return {
        success: false,
        error: 'Table not found',
      };
    }

    const updatedTables = tables.map(t =>
      t.id === tableId
        ? {
            ...t,
            status,
            currentOrderId: status === 'occupied' ? orderId : undefined,
          }
        : t
    );

    return {
      success: true,
      tables: updatedTables,
    };
  }

  /**
   * Assign cashier to table
   */
  static assignCashier(
    tables: Table[],
    tableId: string,
    cashierId: string,
    user: User
  ): {
    success: boolean;
    tables?: Table[];
    error?: string;
  } {
    if (user.role !== 'admin') {
      return {
        success: false,
        error: 'Unauthorized: Only admin can assign cashiers',
      };
    }

    const table = tables.find(t => t.id === tableId);
    if (!table) {
      return {
        success: false,
        error: 'Table not found',
      };
    }

    const updatedTables = tables.map(t =>
      t.id === tableId ? { ...t, assignedCashierId: cashierId } : t
    );

    return {
      success: true,
      tables: updatedTables,
    };
  }

  /**
   * Get table with order details
   */
  static getTableWithOrder(
    tables: Table[],
    orders: Order[],
    tableId: string,
    user: User
  ): {
    table: Table;
    order?: Order;
  } | null {
    const table = this.getTableById(tables, tableId, user);
    if (!table) return null;

    const order = table.currentOrderId
      ? orders.find(o => o.id === table.currentOrderId)
      : undefined;

    return { table, order };
  }
}
