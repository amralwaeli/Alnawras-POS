import { supabase } from '../../lib/supabase';
import type { Customer, LoyaltyTransaction } from '../models/types';
import { mapCustomer, mapLoyaltyTransaction } from '../models/mappers';

export class LoyaltyController {
  static async getCustomers(branchId: string): Promise<{ success: boolean; customers?: Customer[]; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return { success: true, customers: (data ?? []).map(mapCustomer) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  static async findByPhone(phone: string, branchId: string): Promise<{ success: boolean; customer?: Customer; error?: string }> {
    try {
      const cleaned = phone.replace(/\D/g, '');
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('branch_id', branchId)
        .ilike('phone', `%${cleaned}%`)
        .maybeSingle();
      if (error) throw error;
      return { success: true, customer: data ? mapCustomer(data) : undefined };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  static async createCustomer(data: {
    name: string;
    phone: string;
    email?: string;
    branchId: string;
  }): Promise<{ success: boolean; customer?: Customer; error?: string }> {
    try {
      const { data: row, error } = await supabase
        .from('customers')
        .insert([{
          name: data.name,
          phone: data.phone,
          email: data.email ?? null,
          points_balance: 0,
          total_spent: 0,
          total_visits: 0,
          branch_id: data.branchId,
        }])
        .select()
        .single();
      if (error) throw error;
      return { success: true, customer: mapCustomer(row) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  static async updateCustomer(id: string, data: Partial<Pick<Customer, 'name' | 'email'>>): Promise<{ success: boolean; error?: string }> {
    try {
      const payload: any = {};
      if (data.name !== undefined) payload.name = data.name;
      if (data.email !== undefined) payload.email = data.email;
      const { error } = await supabase.from('customers').update(payload).eq('id', id);
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  static async getTransactions(customerId: string, limit = 50): Promise<{ success: boolean; transactions?: LoyaltyTransaction[]; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('loyalty_transactions')
        .select('*, customers(name)')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return { success: true, transactions: (data ?? []).map(mapLoyaltyTransaction) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  static async getAllTransactions(branchId: string, limit = 100): Promise<{ success: boolean; transactions?: LoyaltyTransaction[]; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('loyalty_transactions')
        .select('*, customers(name)')
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return { success: true, transactions: (data ?? []).map(mapLoyaltyTransaction) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  static async earnPoints(params: {
    customerId: string;
    orderId: string;
    points: number;
    amountSpent: number;
    branchId: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const { error: txErr } = await supabase.from('loyalty_transactions').insert([{
        customer_id: params.customerId,
        order_id: params.orderId,
        type: 'earn',
        points: params.points,
        description: `Earned ${params.points} points on order`,
        branch_id: params.branchId,
      }]);
      if (txErr) throw txErr;

      const { error: custErr } = await supabase.rpc('increment_loyalty_points', {
        p_customer_id: params.customerId,
        p_points: params.points,
        p_amount: params.amountSpent,
      });
      if (custErr) {
        // Fallback: manual update if RPC not available
        const { data: current } = await supabase
          .from('customers').select('points_balance, total_spent, total_visits').eq('id', params.customerId).single();
        await supabase.from('customers').update({
          points_balance: (current?.points_balance ?? 0) + params.points,
          total_spent: (current?.total_spent ?? 0) + params.amountSpent,
          total_visits: (current?.total_visits ?? 0) + 1,
        }).eq('id', params.customerId);
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  static async redeemPoints(params: {
    customerId: string;
    orderId: string;
    points: number;
    branchId: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: current } = await supabase
        .from('customers').select('points_balance').eq('id', params.customerId).single();
      if (!current || current.points_balance < params.points) {
        return { success: false, error: 'Insufficient points balance' };
      }

      const { error: txErr } = await supabase.from('loyalty_transactions').insert([{
        customer_id: params.customerId,
        order_id: params.orderId,
        type: 'redeem',
        points: -params.points,
        description: `Redeemed ${params.points} points for discount`,
        branch_id: params.branchId,
      }]);
      if (txErr) throw txErr;

      const { error: custErr } = await supabase.from('customers').update({
        points_balance: current.points_balance - params.points,
      }).eq('id', params.customerId);
      if (custErr) throw custErr;

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  static async adjustPoints(params: {
    customerId: string;
    points: number;
    description: string;
    branchId: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: current } = await supabase
        .from('customers').select('points_balance').eq('id', params.customerId).single();
      const newBalance = Math.max(0, (current?.points_balance ?? 0) + params.points);

      const { error: txErr } = await supabase.from('loyalty_transactions').insert([{
        customer_id: params.customerId,
        order_id: null,
        type: 'adjust',
        points: params.points,
        description: params.description,
        branch_id: params.branchId,
      }]);
      if (txErr) throw txErr;

      const { error: custErr } = await supabase.from('customers').update({
        points_balance: newBalance,
      }).eq('id', params.customerId);
      if (custErr) throw custErr;

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  static async deleteCustomer(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
