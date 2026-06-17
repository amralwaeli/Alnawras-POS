import { supabase } from '../../lib/supabase';

export interface Shift {
  id: string;
  user_id: string;
  user_name: string;
  branch_id: string;
  opened_at: string;
  closed_at?: string;
  opening_cash: number;
  closing_cash?: number;
  total_sales?: number;
  status: 'open' | 'closed';
}

export class ShiftController {
  static async getCurrentShift(userId: string, branchId: string): Promise<{ success: boolean; shift?: Shift; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('user_id', userId)
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
      
      if (error) throw error;
      return { success: true, shift: data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  static async endShift(shiftId: string, closingCash: number, totalSales: number) {
    try {
      const { data, error } = await supabase
        .from('shifts')
        .update({
          closed_at: new Date().toISOString(),
          closing_cash: closingCash,
          total_sales: totalSales,
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
