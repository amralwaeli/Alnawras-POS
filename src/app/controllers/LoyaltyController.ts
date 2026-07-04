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
      // Atomic + idempotent server-side (migration 0013): one call awards points,
      // accumulates spend/visits, and writes the ledger row in a single
      // transaction — and never double-awards if the payment is retried.
      const { error } = await supabase.rpc('earn_loyalty_points', {
        p_customer_id: params.customerId,
        p_order_id: params.orderId,
        p_points: params.points,
        p_amount: params.amountSpent,
        p_branch_id: params.branchId,
      });
      if (error) throw error;
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
      // Atomic guarded deduction (migration 0013): returns false if the balance
      // is insufficient, so concurrent redemptions can't double-spend or drive
      // the balance negative. Callers must only apply the discount on success.
      const { data, error } = await supabase.rpc('redeem_loyalty_points', {
        p_customer_id: params.customerId,
        p_order_id: params.orderId,
        p_points: params.points,
        p_branch_id: params.branchId,
      });
      if (error) throw error;
      if (data === false) return { success: false, error: 'Insufficient points balance' };
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
      // Atomic (migration 0013): clamps at 0 and records the ACTUAL applied delta,
      // so the transaction ledger always reconciles with the balance.
      const { error } = await supabase.rpc('adjust_loyalty_points', {
        p_customer_id: params.customerId,
        p_points: params.points,
        p_description: params.description,
        p_branch_id: params.branchId,
      });
      if (error) throw error;
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
