/**
 * PickupService.ts
 *
 * Secure, single-use links for customer pickup orders.
 *
 *  - Each link carries a random 64-char hex token (the order id is never in the URL).
 *  - Tokens expire after a TTL and are invalidated the moment the order is marked
 *    "picked" (status = 'completed') so a completed order can never be reopened.
 *  - Receipt images and the merchant payment QR live in public Storage buckets.
 *
 * URL shape:  /#/pickup/<token>
 */
import { supabase } from '../../lib/supabase';

/** Pickup links stay valid for 24h (a customer may order over the course of a day). */
const TOKEN_TTL_HOURS = 24;

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function buildPickupUrl(token: string): string {
  const origin = window.location.origin;
  const base = window.location.pathname.replace(/\/$/, '');
  return `${origin}${base}/#/pickup/${token}`;
}

export interface PickupToken {
  id: string;
  token: string;
  branchId: string;
  orderId: string | null;
  status: 'new' | 'ordered' | 'completed' | 'expired';
  active: boolean;
  expiresAt: string | null;
}

function mapToken(row: any): PickupToken {
  return {
    id: row.id,
    token: row.token,
    branchId: row.branch_id,
    orderId: row.order_id ?? null,
    status: row.status,
    active: row.active,
    expiresAt: row.expires_at ?? null,
  };
}

/** Create a fresh, unique, single-use pickup link. */
export async function createPickupToken(
  branchId: string,
  createdBy?: string,
  createdByName?: string,
): Promise<{ token: string; url: string } | { error: string }> {
  const token = generateToken();
  const now = new Date();
  const id = `pkt-${now.getTime()}-${token.slice(0, 6)}`;
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_HOURS * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from('pickup_tokens').insert({
    id,
    token,
    branch_id: branchId,
    created_by: createdBy ?? null,
    created_by_name: createdByName ?? null,
    status: 'new',
    active: true,
    expires_at: expiresAt,
  });

  if (error) {
    console.error('[PickupService] createPickupToken failed:', error);
    return { error: error.message };
  }

  // Audit: record who created the pickup link.
  try {
    await supabase.from('audit_logs').insert({
      id: `aud-${now.getTime()}-${token.slice(0, 5)}`,
      action: 'pickup.link_created',
      entity: 'pickup_token',
      entity_id: id,
      user_id: createdBy ?? null,
      user_name: createdByName ?? null,
      branch_id: branchId,
      details: { expires_at: expiresAt },
    });
  } catch { /* non-fatal */ }

  return { token, url: buildPickupUrl(token) };
}

/**
 * Validate a token from the URL. Returns null if unknown, expired, deactivated,
 * or already completed (order picked) — so completed orders can't be reopened.
 */
export async function validatePickupToken(token: string): Promise<PickupToken | null> {
  if (!token || token.length !== 64) return null;

  const { data, error } = await supabase
    .from('pickup_tokens')
    .select('*')
    .eq('token', token)
    .eq('active', true)
    .single();

  if (error || !data) return null;
  if (data.status === 'completed' || data.status === 'expired') return null;

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    await supabase.from('pickup_tokens').update({ active: false, status: 'expired' }).eq('token', token);
    return null;
  }
  return mapToken(data);
}

/** Link a submitted order to its token and mark the token as used (ordered). */
export async function attachOrderToToken(token: string, orderId: string): Promise<void> {
  await supabase
    .from('pickup_tokens')
    .update({ order_id: orderId, status: 'ordered' })
    .eq('token', token);
}

/** Permanently invalidate a token (called when the order is marked picked). */
export async function completePickupToken(orderId: string): Promise<void> {
  await supabase
    .from('pickup_tokens')
    .update({ active: false, status: 'completed' })
    .eq('order_id', orderId);
}

// ─── Storage: receipts & merchant QR ──────────────────────────────────────────

/** Upload a customer's payment receipt image; returns its public URL. */
export async function uploadReceipt(token: string, file: File): Promise<string | null> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${token}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('pickup-receipts').upload(path, file, {
    cacheControl: '3600',
    upsert: true,
    contentType: file.type || 'image/jpeg',
  });
  if (error) {
    console.error('[PickupService] uploadReceipt failed:', error);
    return null;
  }
  return supabase.storage.from('pickup-receipts').getPublicUrl(path).data.publicUrl;
}

/** Public URL of the branch's merchant payment QR (fixed path per branch). */
export function merchantQrUrl(branchId: string): string {
  return supabase.storage.from('merchant-qr').getPublicUrl(`${branchId}.png`).data.publicUrl;
}

/** Admin uploads / replaces the branch's merchant payment QR. */
export async function uploadMerchantQr(branchId: string, file: File): Promise<string | null> {
  const { error } = await supabase.storage.from('merchant-qr').upload(`${branchId}.png`, file, {
    cacheControl: '0',
    upsert: true,
    contentType: file.type || 'image/png',
  });
  if (error) {
    console.error('[PickupService] uploadMerchantQr failed:', error);
    return null;
  }
  return merchantQrUrl(branchId);
}
