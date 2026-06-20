/**
 * PickupController.ts
 *
 * Server-side lifecycle for customer pickup orders. Pickup orders are normal
 * `orders` rows (order_type = 'pickup'); this controller only adds the
 * pickup-specific glue: linking the secure token, online-payment verification,
 * the preparing → ready → picked status workflow, and audit logging.
 */
import { supabase } from '../../lib/supabase';
import { OrderController, SubmitOrderItem } from './OrderController';
import { attachOrderToToken, completePickupToken } from '../services/PickupService';
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
  /** Customer submits their pickup order from the secure link. */
  static async submitPickupOrder(params: SubmitPickupParams): Promise<Result<Order>> {
    const result = await OrderController.submitOrder({
      branchId: params.branchId,
      orderType: 'pickup',
      table: null,
      items: params.items,
      addedBy: 'pickup-customer',
      addedByName: params.customerName || 'Pickup Customer',
      pickup: {
        method: params.method,
        payType: params.payType,
        customerName: params.customerName,
        customerPhone: params.customerPhone,
        customerEmail: params.customerEmail,
        receiptUrl: params.receiptUrl,
        paymentStatus: params.payType === 'online' ? 'pending_verification' : 'unpaid',
      },
    });

    if (result.success && result.data) {
      await attachOrderToToken(params.token, result.data.id);
      await audit('pickup.order_submitted', 'order', result.data.id, { branchId: params.branchId }, {
        method: params.method, payType: params.payType, customer: params.customerName,
      });
    }
    return result;
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
  static async rejectPayment(orderId: string, actor: AuditActor): Promise<Result<void>> {
    try {
      const { error } = await supabase.from('orders')
        .update({ payment_status: 'rejected' }).eq('id', orderId);
      if (error) throw error;
      await audit('pickup.payment_rejected', 'order', orderId, actor);
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
      if (status === 'ready') {
        try {
          const { data } = await supabase.from('orders')
            .select('customer_email, customer_name, bill_number').eq('id', orderId).single();
          if (data?.customer_email) {
            await supabase.functions.invoke('send-pickup-ready', {
              body: { to: data.customer_email, customerName: data.customer_name, billNumber: data.bill_number },
            });
          }
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
