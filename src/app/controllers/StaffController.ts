import { Staff } from '../models/types';
import { mapStaff } from '../models/mappers';
import { supabase } from '../../lib/supabase';

/** Every staff column the API may read (migration 0030 hides pin / pin_hash). */
export const STAFF_COLUMNS = 'id, name, employment_number, role, email, status, branch_id, hire_date, hourly_rate, job_role, created_at';

/** Staff accounts are created and changed through Workforce (WorkforceController). */
export class StaffController {
  static async getStaff(activeOnly: boolean = false): Promise<{ success: boolean; data?: Staff[]; error?: string }> {
    try {
      let query = supabase.from('users').select(STAFF_COLUMNS);
      if (activeOnly) query = query.eq('status', 'active');
      const { data, error } = await query;
      if (error) return { success: false, error: error.message };
      return { success: true, data: (data || []).map(mapStaff) };
    } catch (err) {
      return { success: false, error: 'Failed to fetch staff' };
    }
  }
}
