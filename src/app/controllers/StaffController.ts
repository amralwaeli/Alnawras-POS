import { Staff } from '../models/types';
import { mapStaff } from '../models/mappers';
import { supabase } from '../../lib/supabase';

export class StaffController {
  static async getStaff(activeOnly: boolean = false): Promise<{ success: boolean; data?: Staff[]; error?: string }> {
    try {
      let query = supabase.from('users').select('*');
      if (activeOnly) query = query.eq('status', 'active');
      const { data, error } = await query;
      if (error) return { success: false, error: error.message };
      return { success: true, data: (data || []).map(mapStaff) };
    } catch (err) {
      return { success: false, error: 'Failed to fetch staff' };
    }
  }

  static async addStaff(
    newStaff: Omit<Staff, 'id' | 'createdAt'>
  ): Promise<{ success: boolean; data?: Staff; error?: string }> {
    try {
      // --- INPUT VALIDATION ---
      if (!newStaff.name?.trim()) return { success: false, error: 'Name is required' };
      if (!newStaff.employmentNumber?.trim()) return { success: false, error: 'Employment number is required' };
      if (!newStaff.pin || !/^\d{4}$/.test(newStaff.pin)) return { success: false, error: 'PIN must be exactly 4 digits' };
      if (!newStaff.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newStaff.email)) {
        return { success: false, error: 'A valid email is required' };
      }
      if (!newStaff.role) return { success: false, error: 'Role is required' };
      if (!newStaff.branchId) return { success: false, error: 'Branch ID is required' };

      // Check for existing employment number or email to prevent DB conflict errors
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .or(`employment_number.eq.${newStaff.employmentNumber},email.eq.${newStaff.email}`)
        .maybeSingle();
      
      if (existing) {
        return { success: false, error: 'Employment number or Email already exists' };
      }
      // ------------------------

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
        // These now exist in your DB thanks to the SQL update
        hire_date: new Date().toISOString(),
        hourly_rate: newStaff.hourlyRate || 0,
        position: newStaff.position || newStaff.role
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

      return { success: true, data: mapStaff(data) };
    } catch (err) {
      return { success: false, error: 'Failed to add staff member' };
    }
  }

  static async updateStaff(
    staffId: string,
    updates: Partial<Staff>
  ): Promise<{ success: boolean; data?: Staff; error?: string }> {
    try {
      // --- INPUT VALIDATION ---
      if (updates.name !== undefined && !updates.name.trim()) return { success: false, error: 'Name cannot be empty' };
      if (updates.pin !== undefined && !/^\d{4}$/.test(updates.pin)) return { success: false, error: 'PIN must be exactly 4 digits' };
      if (updates.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)) {
        return { success: false, error: 'A valid email is required' };
      }

      // Check for existing employment number or email if they are being changed
      if (updates.employmentNumber || updates.email) {
        let filter = '';
        if (updates.employmentNumber) filter += `employment_number.eq.${updates.employmentNumber}`;
        if (updates.email) filter += (filter ? ',' : '') + `email.eq.${updates.email}`;

        const { data: existing } = await supabase
          .from('users')
          .select('id')
          .or(filter)
          .neq('id', staffId)
          .maybeSingle();
        
        if (existing) {
          return { success: false, error: 'Employment number or Email already exists' };
        }
      }
      // ------------------------

      const dbUpdates: any = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.employmentNumber !== undefined) dbUpdates.employment_number = updates.employmentNumber;
      if (updates.role !== undefined) dbUpdates.role = updates.role;
      if (updates.pin !== undefined) dbUpdates.pin = updates.pin;
      if (updates.email !== undefined) dbUpdates.email = updates.email;
      if (updates.status !== undefined) dbUpdates.status = updates.status;
      if (updates.branchId !== undefined) dbUpdates.branch_id = updates.branchId;
      if (updates.hourlyRate !== undefined) dbUpdates.hourly_rate = updates.hourlyRate;
      if (updates.position !== undefined) dbUpdates.position = updates.position;

      const { data, error } = await supabase
        .from('users')
        .update(dbUpdates)
        .eq('id', staffId)
        .select()
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, data: mapStaff(data) };
    } catch (err) {
      return { success: false, error: 'Failed to update staff member' };
    }
  }

  static async deleteStaff(staffId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.from('users').delete().eq('id', staffId);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err) {
      return { success: false, error: 'Failed to delete staff member' };
    }
  }
}
