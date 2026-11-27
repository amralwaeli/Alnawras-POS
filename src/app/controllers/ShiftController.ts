import { supabase } from '../../lib/supabase';

export interface Shift {
  id: string;
  user_id: string;
  user_name: string;
  branch_id: string;
  opened_at: string;
  closed_at?: string;
  closed_by_name?: string;
  opening_cash: number;
  closing_cash?: number;
  total_sales?: number;
  status: 'open' | 'closed';
}

export class ShiftController {
  /** One shift for the whole restaurant: whoever opened it, everyone signed in continues it. */
  static async getCurrentShift(branchId: string): Promise<{ success: boolean; shift?: Shift; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('branch_id', branchId)
        .eq('status', 'open')
        .maybeSingle();
      
      if (error) throw error;
      return { success: true, shift: data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  static async openShift(params: { userId: string; userName: string; branchId: string; openingCash: number }) {
    try {
      const { data, error } = await supabase
        .from('shifts')
        .insert([{
          user_id: params.userId,
          user_name: params.userName,
          branch_id: params.branchId,
          opened_at: new Date().toISOString(),
          opening_cash: params.openingCash,
          status: 'open'
        }])
        .select()
        .single();

      // shifts_one_open_per_branch: someone else already opened the shift.
      if (error?.code === '23505') return { success: false, error: 'A shift is already open for the restaurant — refresh the page' };
      if (error) throw error;
      return { success: true, shift: data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  static async endShift(shiftId: string, closingCash: number, totalSales: number, closedByName: string) {
    try {
      const { data, error } = await supabase
        .from('shifts')
        .update({
          closed_at: new Date().toISOString(),
          closing_cash: closingCash,
          total_sales: totalSales,
          closed_by_name: closedByName,
          status: 'closed'
        })
        .eq('id', shiftId)
        .select()
        .single();
      
      if (error) throw error;
      return { success: true, shift: data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
