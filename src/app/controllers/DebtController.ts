import { supabase } from '../../lib/supabase';
import { Result } from '../models/types';

/** Customer debt accounts (migration 0036). Balances and due dates come from the server. */
export type DebtTerms = 'weekly' | 'monthly' | 'flexible';
export interface DebtAccount {
  id: string; name: string; phone: string | null; terms: DebtTerms; creditLimit: number | null;
  notes: string | null; isActive: boolean; balance: number;
  oldestUnpaidAt: string | null; dueDate: string | null; overdue: boolean; lastPaymentAt: string | null;
}
export interface DebtEntry {
  id: string; kind: 'charge' | 'payment' | 'adjustment'; amount: number; method: string | null;
  orderId: string | null; note: string | null; createdByName: string | null; createdAt: string;
}
export type DebtPayMethod = 'cash' | 'card' | 'qr' | 'transfer';

const fail = (e: any): { success: false; error: string } => ({ success: false, error: e?.message || 'Something went wrong' });

export class DebtController {
  static async list(branchId: string): Promise<Result<DebtAccount[]>> {
    const { data, error } = await supabase.rpc('debt_account_summary', {
      p_branch_id: branchId, p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kuala_Lumpur',
    });
    if (error) return fail(error);
    return {
      success: true,
      data: (data ?? []).map((r: any) => ({
        id: r.id, name: r.name, phone: r.phone, terms: r.terms,
        creditLimit: r.credit_limit == null ? null : Number(r.credit_limit),
        notes: r.notes, isActive: r.is_active, balance: Number(r.balance ?? 0),
        oldestUnpaidAt: r.oldest_unpaid_at, dueDate: r.due_date, overdue: !!r.overdue, lastPaymentAt: r.last_payment_at,
      })),
    };
  }

  /** Create (no id) or edit an account. */
  static async save(branchId: string, a: { id?: string; name: string; phone?: string | null; terms: DebtTerms; creditLimit?: number | null; notes?: string | null; isActive?: boolean }): Promise<Result<{ id: string }>> {
    const row = {
      branch_id: branchId, name: a.name.trim(), phone: a.phone?.trim() || null, terms: a.terms,
      credit_limit: a.creditLimit ?? null, notes: a.notes?.trim() || null, is_active: a.isActive ?? true,
    };
    const q = a.id
      ? supabase.from('debt_accounts').update(row).eq('id', a.id).select('id').single()
      : supabase.from('debt_accounts').insert(row).select('id').single();
    const { data, error } = await q;
    return error ? fail(error) : { success: true, data: { id: data.id } };
  }

  static async entries(accountId: string): Promise<Result<DebtEntry[]>> {
    const { data, error } = await supabase.from('debt_entries')
      .select('id, kind, amount, method, order_id, note, created_by_name, created_at')
      .eq('account_id', accountId).order('created_at', { ascending: false }).limit(500);
    if (error) return fail(error);
    return {
      success: true,
      data: (data ?? []).map((r: any) => ({
        id: r.id, kind: r.kind, amount: Number(r.amount), method: r.method, orderId: r.order_id,
        note: r.note, createdByName: r.created_by_name, createdAt: r.created_at,
      })),
    };
  }

  /** Money collected from the customer. Returns the new balance. */
  static async recordPayment(branchId: string, accountId: string, amount: number, method: DebtPayMethod, note: string, by: { id: string; name: string }): Promise<Result<number>> {
    const { data, error } = await supabase.rpc('record_debt_payment', {
      p_branch_id: branchId, p_account_id: accountId, p_amount: amount, p_method: method,
      p_note: note, p_by: by.id, p_by_name: by.name,
    });
    return error ? fail(error) : { success: true, data: Number(data) };
  }

  /** Correction: + adds to the debt, − forgives part of it. Reason required. */
  static async adjust(branchId: string, accountId: string, amount: number, note: string, by: { id: string; name: string }): Promise<Result<number>> {
    const { data, error } = await supabase.rpc('adjust_debt', {
      p_branch_id: branchId, p_account_id: accountId, p_amount: amount, p_note: note, p_by: by.id, p_by_name: by.name,
    });
    return error ? fail(error) : { success: true, data: Number(data) };
  }
}
