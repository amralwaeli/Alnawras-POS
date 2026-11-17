/**
 * PickupController.ts
 *
 * Server-side lifecycle for customer pickup orders. Pickup orders are normal
 * `orders` rows (order_type = 'pickup'); this controller only adds the
 * pickup-specific glue: linking the secure token, online-payment verification,
 * the preparing → ready → picked status workflow, and audit logging.
 */
import { supabase } from '../../lib/supabase';
import type { SubmitOrderItem } from './OrderController';
import { completePickupToken } from '../services/PickupService';
import { mapOrder } from '../models/mappers';
import { Order, Result } from '../models/types';

interface AuditActor { id?: string; name?: string; branchId?: string }

async function audit(action: string, entity: string, entityId: string, actor: AuditActor, details: any = {}) {
  try {
    await supabase.from('audit_logs').insert({
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      action,
      entity,
      entity_id: entityId,
      user_id: actor.id ?? null,
      user_name: actor.name ?? null,
      branch_id: actor.branchId ?? null,
      details,
    });
  } catch (err) {
    console.warn('[PickupController] audit log failed', err);
  }
}

export interface SubmitPickupParams {
  token: string;
  branchId: string;
  items: SubmitOrderItem[];
  method: 'grab' | 'lalamove' | 'self';
  payType: 'cash' | 'online';
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  receiptUrl?: string;
}

export class PickupController {
  /** Customer submits their pickup order from the secure link. Prices, the
   *  one-order-per-link rule, field checks and the audit row are all enforced
   *  by pickup_submit (migration 0029), not here. */
  static async submitPickupOrder(params: SubmitPickupParams): Promise<Result<{ id: string }>> {
    const { data, error } = await supabase.rpc('pickup_submit', {
      p_token: params.token,
      p_details: {
        customerName: params.customerName, customerPhone: params.customerPhone,
        customerEmail: params.customerEmail ?? null, method: params.method,
        payType: params.payType, receiptUrl: params.receiptUrl ?? null,
      },
      p_items: params.items.map(i => ({
        product_id: i.productId, quantity: i.quantity, notes: i.notes || null,
        option_ids: (i.modifiers ?? []).map(m => m.optionId).filter(Boolean),
      })),
    });
    if (error) return { success: false, error: error.message || 'Could not place order.' };
    return { success: true, data: { id: data.order_id } };
  }

  /** Staff approves an online payment after checking the receipt. */
  static async approvePayment(orderId: string, actor: AuditActor): Promise<Result<void>> {
    try {
      const { error } = await supabase.from('orders')
        .update({ payment_status: 'paid' }).eq('id', orderId);
      if (error) throw error;
      await audit('pickup.payment_approved', 'order', orderId, actor);
      return { success: true, data: undefined };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /** Staff rejects an online payment (bad/illegible receipt). */
  static async rejectPayment(orderId: string, actor: AuditActor, reason?: string): Promise<Result<void>> {
    try {
      const { error } = await supabase.from('orders')
        .update({ payment_status: 'rejected' }).eq('id', orderId);
      if (error) throw error;
      await audit('pickup.payment_rejected', 'order', orderId, actor, { reason: reason || null });
      return { success: true, data: undefined };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /** Staff cancels a pickup order (e.g. after a rejected payment) so it leaves the kitchen screen. */
  static async cancelOrder(orderId: string, actor: AuditActor, reason?: string): Promise<Result<void>> {
    try {
      const { error } = await supabase.from('orders')
        .update({ status: 'cancelled' }).eq('id', orderId);
      if (error) throw error;
      // The customer's pickup link must stop working too.
      await supabase.from('pickup_tokens').update({ active: false, status: 'expired' }).eq('order_id', orderId);
      await audit('pickup.cancelled', 'order', orderId, actor, { reason: reason || null });
      return { success: true, data: undefined };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /** Move the pickup order through preparing → ready. */
  static async setPickupStatus(
    orderId: string,
    status: 'preparing' | 'ready',
    actor: AuditActor,
  ): Promise<Result<void>> {
    try {
      const { error } = await supabase.from('orders')
        .update({ pickup_status: status }).eq('id', orderId);
      if (error) throw error;
      await audit(`pickup.${status}`, 'order', orderId, actor);

      // On READY, email the customer (best-effort — never blocks the status change).
      // The edge function resolves the recipient from the order itself using the
      // service role; we pass only the orderId, so the client can never address an
      // arbitrary recipient (the function is not an open relay).
      if (status === 'ready') {
        try {
          await supabase.functions.invoke('send-pickup-ready', { body: { orderId } });
        } catch (mailErr) {
          console.warn('[PickupController] ready email failed (non-fatal):', mailErr);
        }
      }
      return { success: true, data: undefined };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /** Customer collected the order: mark picked, complete it, invalidate the link. */
  static async markPicked(orderId: string, actor: AuditActor): Promise<Result<void>> {
    try {
      const { error } = await supabase.from('orders')
        .update({ pickup_status: 'picked', status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', orderId);
      if (error) throw error;
      await completePickupToken(orderId);
      await audit('pickup.picked', 'order', orderId, actor);
      return { success: true, data: undefined };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /** All pickup orders for the branch (open ones + today's completed). */
  static async getPickupOrders(branchId: string): Promise<Result<Order[]>> {
    try {
      const startOfDay = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('branch_id', branchId)
        .eq('order_type', 'pickup')
        .or(`status.eq.open,completed_at.gte.${startOfDay}`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return { success: true, data: (data ?? []).map(mapOrder) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
