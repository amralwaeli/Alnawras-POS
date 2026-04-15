import { Table, Order, User } from '../models/types';
import { AuthController } from './AuthController';
import { supabase } from '../../lib/supabase';

export class TableController {
  /**
   * Get all tables from database
   */
  static async getTables(user: User): Promise<{
    success: boolean;
    tables?: Table[];
    error?: string;
  }> {
    if (!AuthController.hasPermission(user, 'canViewTables')) {
      return {
        success: false,
        error: 'Unauthorized: Cannot view tables',
      };
    }

    try {
      const { data, error } = await supabase
        .from('tables')
        .select('*')
        .eq('branch_id', user.branchId)
        .order('number');

      if (error) throw error;

      const tables: Table[] = data.map(table => ({
        id: table.id,
        number: table.number,
        capacity: table.capacity,
        status: table.status,
        branchId: table.branch_id,
        currentOrderId: table.current_order_id,
        assignedCashierId: table.assigned_cashier_id,
        needsWaiter: table.needs_waiter ?? false,
      }));

      return {
        success: true,
        tables,
      };
    } catch (error) {
      console.error('Error fetching tables:', error);
      return {
        success: false,
        error: 'Failed to fetch tables',
      };
    }
  }

  /**
   * Add a new table
   */
  static async addTable(
    tableData: { number: number; capacity: number },
    user: User
  ): Promise<{
    success: boolean;
    table?: Table;
    error?: string;
  }> {
    if (!AuthController.hasPermission(user, 'canManageInventory')) {
      return {
        success: false,
        error: 'Unauthorized: Cannot manage tables',
      };
    }

    try {
      const { data, error } = await supabase
        .from('tables')
        .insert({
          id: `table-${Date.now()}`,
          number: tableData.number,
          capacity: tableData.capacity,
          status: 'available',
          branch_id: user.branchId,
        })
        .select()
        .single();

      if (error) throw error;

      const table: Table = {
        id: data.id,
        number: data.number,
        capacity: data.capacity,
        status: data.status,
        branchId: data.branch_id,
        currentOrderId: data.current_order_id,
        assignedCashierId: data.assigned_cashier_id,
        needsWaiter: data.needs_waiter ?? false,
      };

      return {
        success: true,
        table,
      };
    } catch (error) {
      console.error('Error adding table:', error);
      return {
        success: false,
        error: 'Failed to add table',
      };
    }
  }

  /**
   * Update table
   */
  static async updateTable(
    tableId: string,
    updates: Partial<{ number: number; capacity: number; status: string; assignedCashierId?: string }>,
    user: User
  ): Promise<{
    success: boolean;
    table?: Table;
    error?: string;
  }> {
    if (!AuthController.hasPermission(user, 'canManageInventory')) {
      return {
        success: false,
        error: 'Unauthorized: Cannot manage tables',
      };
    }

    try {
      const { data, error } = await supabase
        .from('tables')
        .update({
          number: updates.number,
          capacity: updates.capacity,
          status: updates.status,
          assigned_cashier_id: updates.assignedCashierId,
        })
        .eq('id', tableId)
        .eq('branch_id', user.branchId)
        .select()
        .single();

      if (error) throw error;

      const table: Table = {
        id: data.id,
        number: data.number,
        capacity: data.capacity,
        status: data.status,
        branchId: data.branch_id,
        currentOrderId: data.current_order_id,
        assignedCashierId: data.assigned_cashier_id,
        needsWaiter: data.needs_waiter ?? false,
      };

      return {
        success: true,
        table,
      };
    } catch (error) {
      console.error('Error updating table:', error);
      return {
        success: false,
        error: 'Failed to update table',
      };
    }
  }

  /**
   * Delete table
   */
  static async deleteTable(
    tableId: string,
    user: User
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (!AuthController.hasPermission(user, 'canManageInventory')) {
      return {
        success: false,
        error: 'Unauthorized: Cannot manage tables',
      };
    }

    try {
      const { error } = await supabase
        .from('tables')
        .delete()
        .eq('id', tableId)
        .eq('branch_id', user.branchId);

      if (error) throw error;

      return {
        success: true,
      };
    } catch (error) {
      console.error('Error deleting table:', error);
      return {
        success: false,
        error: 'Failed to delete table',
      };
    }
  }

  /**
   * Get table by ID
   */
  static async getTableById(
    tableId: string,
    user: User
  ): Promise<{
    success: boolean;
    table?: Table;
    error?: string;
  }> {
    if (!AuthController.hasPermission(user, 'canViewTables')) {
      return {
        success: false,
        error: 'Unauthorized: Cannot view tables',
      };
    }

    try {
      const { data, error } = await supabase
        .from('tables')
        .select('*')
        .eq('id', tableId)
        .eq('branch_id', user.branchId)
        .single();

      if (error) throw error;

      const table: Table = {
        id: data.id,
        number: data.number,
        capacity: data.capacity,
        status: data.status,
        branchId: data.branch_id,
        currentOrderId: data.current_order_id,
        assignedCashierId: data.assigned_cashier_id,
        needsWaiter: data.needs_waiter ?? false,
      };

      // Cashiers can only see their assigned tables
      if (user.role === 'cashier' && table.assignedCashierId !== user.id) {
        return {
          success: false,
          error: 'Unauthorized: Cannot view this table',
        };
      }

      return {
        success: true,
        table,
      };
    } catch (error) {
      console.error('Error fetching table:', error);
      return {
        success: false,
        error: 'Failed to fetch table',
      };
    }
  }
}
