import { Staff, User } from '../models/types';
import { supabase } from '../../lib/supabase';

/**
 * Maps a raw Supabase DB row (snake_case) to a typed User/Staff object (camelCase).
 * Without this mapping, fields like branchId, employmentNumber, createdAt are
 * always undefined, causing all branch-scoped DB writes to fail with NOT NULL errors.
 */
function mapDbRowToStaff(row: any): Staff {
  return {
    id: row.id,
    name: row.name,
    employmentNumber: row.employment_number,
    role: row.role,
    pin: row.pin,
    email: row.email,
    status: row.status,
    branchId: row.branch_id,
    createdAt: new Date(row.created_at),
    lastLogin: row.last_login ? new Date(row.last_login) : undefined,
    // Staff-specific fields
    hourlyRate: row.hourly_rate,
    position: row.position ?? row.role,
    hireDate: row.hire_date ? new Date(row.hire_date) : new Date(row.created_at),
  };
}

export class StaffController {
  /**
   * Get all staff members from database
   */
  static async getStaff(activeOnly: boolean = false): Promise<{ success: boolean; data?: Staff[]; error?: string }> {
    try {
      let query = supabase.from('users').select('*');

      if (activeOnly) {
        query = query.eq('status', 'active');
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching staff:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data: (data || []).map(mapDbRowToStaff) };
    } catch (err) {
      console.error('Error in getStaff:', err);
      return { success: false, error: 'Failed to fetch staff' };
    }
  }

  /**
   * Get staff by ID from database
   */
  static async getStaffById(staffId: string): Promise<{ success: boolean; data?: Staff; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', staffId)
        .single();

      if (error) {
        console.error('Error fetching staff by ID:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data: mapDbRowToStaff(data) };
    } catch (err) {
      console.error('Error in getStaffById:', err);
      return { success: false, error: 'Failed to fetch staff member' };
    }
  }

  /**
   * Add new staff member to database
   */
  static async addStaff(
    newStaff: Omit<Staff, 'id' | 'createdAt'>
  ): Promise<{ success: boolean; data?: Staff; error?: string }> {
    try {
      const id = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const staffData = {
        id,
        name: newStaff.name,
        employment_number: newStaff.employmentNumber,
        role: newStaff.role,
        pin: newStaff.pin,
        email: newStaff.email,
        status: newStaff.status,
        branch_id: newStaff.branchId,
        created_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('users')
        .insert([staffData])
        .select()
        .single();

      if (error) {
        console.error('Error adding staff:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data: mapDbRowToStaff(data) };
    } catch (err) {
      console.error('Error in addStaff:', err);
      return { success: false, error: 'Failed to add staff member' };
    }
  }

  /**
   * Update staff member in database
   */
  static async updateStaff(
    staffId: string,
    updates: Partial<Staff>
  ): Promise<{ success: boolean; data?: Staff; error?: string }> {
    try {
      const dbUpdates: any = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.employmentNumber !== undefined) dbUpdates.employment_number = updates.employmentNumber;
      if (updates.role !== undefined) dbUpdates.role = updates.role;
      if (updates.pin !== undefined) dbUpdates.pin = updates.pin;
      if (updates.email !== undefined) dbUpdates.email = updates.email;
      if (updates.status !== undefined) dbUpdates.status = updates.status;
      if (updates.branchId !== undefined) dbUpdates.branch_id = updates.branchId;

      const { data, error } = await supabase
        .from('users')
        .update(dbUpdates)
        .eq('id', staffId)
        .select()
        .single();

      if (error) {
        console.error('Error updating staff:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data: mapDbRowToStaff(data) };
    } catch (err) {
      console.error('Error in updateStaff:', err);
      return { success: false, error: 'Failed to update staff member' };
    }
  }

  /**
   * Delete staff member from database
   */
  static async deleteStaff(staffId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', staffId);

      if (error) {
        console.error('Error deleting staff:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      console.error('Error in deleteStaff:', err);
      return { success: false, error: 'Failed to delete staff member' };
    }
  }
}
