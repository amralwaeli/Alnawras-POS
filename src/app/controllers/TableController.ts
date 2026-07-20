import { Table, User, Result } from '../models/types';
import { AuthController } from './AuthController';
import { mapTable } from '../models/mappers';
import { supabase } from '../../lib/supabase';

export class TableController {
  /**
   * Get all tables from database
   */
  static async getTables(user: User): Promise<Result<Table[]>> {
    if (!AuthController.hasPermission(user, 'canViewTables')) {
      return { success: false, error: 'Unauthorized: Cannot view tables' };
    }

    try {
      const { data, error } = await supabase
        .from('tables')
        .select('*')
        .eq('branch_id', user.branchId)
        .order('number');

      if (error) throw error;
      return { success: true, data: (data || []).map(mapTable) };
    } catch (error) {
      console.error('Error fetching tables:', error);
      return { success: false, error: 'Failed to fetch tables' };
    }
  }

  /**
   * Add a new table
   */
  static async addTable(
    tableData: { number: number; capacity: number },
    user: User
  ): Promise<Result<Table>> {
    if (!AuthController.hasPermission(user, 'canManageInventory')) {
      return { success: false, error: 'Unauthorized: Cannot manage tables' };
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
      return { success: true, data: mapTable(data) };
    } catch (error) {
      console.error('Error adding table:', error);
      return { success: false, error: 'Failed to add table' };
    }
  }

  /**
   * Update table
   */
  static async updateTable(
    tableId: string,
    updates: Partial<{ number: number; capacity: number; status: string; assignedCashierId?: string }>,
    user: User
  ): Promise<Result<Table>> {
    if (!AuthController.hasPermission(user, 'canManageInventory')) {
      return { success: false, error: 'Unauthorized: Cannot manage tables' };
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
      return { success: true, data: mapTable(data) };
    } catch (error) {
      console.error('Error updating table:', error);
      return { success: false, error: 'Failed to update table' };
    }
  }

  /**
   * Delete table
   */
  static async deleteTable(tableId: string, user: User): Promise<Result<void>> {
    if (!AuthController.hasPermission(user, 'canManageInventory')) {
      return { success: false, error: 'Unauthorized: Cannot manage tables' };
    }

    try {
      const { error } = await supabase
        .from('tables')
        .delete()
        .eq('id', tableId)
        .eq('branch_id', user.branchId);

      if (error) throw error;
      return { success: true, data: undefined };
    } catch (error) {
      console.error('Error deleting table:', error);
      return { success: false, error: 'Failed to delete table' };
    }
  }

  /**
   * Move an open order (and its table) from one table to another. The target
   * table must currently be available. Any active group-ordering session on
   * the old table moves with the order so guest devices already scanned in
   * keep working against the new table instead of silently breaking.
   */
  static async transferOrder(
    orderId: string,
    fromTableId: string,
    toTableId: string,
    user: User
  ): Promise<Result<void>> {
    if (!AuthController.hasPermission(user, 'canViewTables')) {
      return { success: false, error: 'Unauthorized: Cannot move tables' };
    }
    if (fromTableId === toTableId) {
      return { success: false, error: 'Already at that table' };
    }

    try {
      // One atomic, target-locked transaction (migration 0021). The RPC derives
      // the real source table from the order itself, locks the target so two
      // concurrent moves can't collide on one table, and moves any active group
      // session along with the order — replacing the previous four unsequenced
      // client writes.
      const { error } = await supabase.rpc('move_order_to_table', {
        p_order_id: orderId,
        p_to_table_id: toTableId,
        p_branch_id: user.branchId,
      });
      if (error) throw error;
      return { success: true, data: undefined };
    } catch (error: any) {
      console.error('Error transferring order to new table:', error);
      return { success: false, error: error?.message || 'Failed to move table' };
    }
  }

  /**
   * Turn customer QR self-ordering on/off for a table. Staff-only toggle —
   * customers never set this themselves. See migration 0014.
   */
  static async setOrderingEnabled(tableId: string, enabled: boolean, user: User): Promise<Result<void>> {
    if (!AuthController.hasPermission(user, 'canViewTables')) {
      return { success: false, error: 'Unauthorized: Cannot change ordering status' };
    }
    try {
      const { error } = await supabase
        .from('tables')
        .update({ ordering_enabled: enabled })
        .eq('id', tableId)
        .eq('branch_id', user.branchId);
      if (error) throw error;
      return { success: true, data: undefined };
    } catch (error: any) {
      console.error('Error updating table ordering status:', error);
      return { success: false, error: error?.message || 'Failed to update ordering status' };
    }
  }

  /**
   * Get table by ID
   */
  static async getTableById(tableId: string, user: User): Promise<Result<Table>> {
    if (!AuthController.hasPermission(user, 'canViewTables')) {
      return { success: false, error: 'Unauthorized: Cannot view tables' };
    }

    try {
      const { data, error } = await supabase
        .from('tables')
        .select('*')
        .eq('id', tableId)
        .eq('branch_id', user.branchId)
        .single();

      if (error) throw error;
      const table = mapTable(data);

      // Cashiers can only see their assigned tables
      if (user.role === 'cashier' && table.assignedCashierId !== user.id) {
        return { success: false, error: 'Unauthorized: Cannot view this table' };
      }

      return { success: true, data: table };
    } catch (error) {
      console.error('Error fetching table:', error);
      return { success: false, error: 'Failed to fetch table' };
    }
  }
}
