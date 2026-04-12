import { Staff } from '../models/types';
import { supabase } from '../../lib/supabase';

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

      return { success: true, data: data || [] };
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

      return { success: true, data };
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
      // Generate ID
      const id = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const staffData = {
        id,
        ...newStaff,
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

      return { success: true, data };
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
      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', staffId)
        .select()
        .single();

      if (error) {
        console.error('Error updating staff:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data };
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
