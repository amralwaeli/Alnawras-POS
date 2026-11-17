/**
 * GroupOrderService.ts
 *
 * Secure multi-device group ordering for table QR codes.
 *
 *  - The QR holds a stable `tables.qr_token` that identifies the table only.
 *  - Each scanning device joins the table's single ACTIVE order group and gets
 *    its own guest session (UUIDv7 id + 64-hex random token).
 *  - Closing the table closes the group + every guest session, invalidating all
 *    tokens. The next scan starts a brand-new group; old sessions never work.
 */
import { supabase } from '../../lib/supabase';

// ── ID / token generation ─────────────────────────────────────────────────────

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/** Customer-facing URL for the table QR. Encodes only the stable table token. */
export function buildGroupOrderUrl(qrToken: string): string {
  const origin = window.location.origin;
  const base = window.location.pathname.replace(/\/$/, '');
  return `${origin}${base}/#/order/t/${qrToken}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────


const storageKey = (qrToken: string) => `alnawras_guest_${qrToken}`;

// ── Admin: ensure a table has its stable QR token ─────────────────────────────

export async function ensureTableQrToken(tableId: string): Promise<string | null> {
  const { data } = await supabase.from('tables').select('qr_token').eq('id', tableId).single();
  if (data?.qr_token) return data.qr_token;
  const token = randomToken();
  const { error } = await supabase.from('tables').update({ qr_token: token }).eq('id', tableId);
  return error ? null : token;
}

/** Rotate a table's QR token — instantly invalidates the previously printed QR. */
export async function rotateTableQrToken(tableId: string): Promise<string | null> {
  const token = randomToken();
  const { error } = await supabase.from('tables').update({ qr_token: token }).eq('id', tableId);
  return error ? null : token;
}

/**
 * Join the table's party from a QR token (the printed table token, or an older
 * qr_sessions token). Everything is decided server-side by guest_join
 * (migration 0029). The guest token is kept per QR so a refresh resumes the
 * same guest. Returns the guest-session token, 'closed' when the branch is not
 * taking orders, or null for an unknown QR.
 */
export async function joinTable(qrToken: string): Promise<string | 'closed' | null> {
  if (!qrToken) return null;
  let saved: string | null = null;
  try { saved = localStorage.getItem(storageKey(qrToken)); } catch { /* private mode */ }
  const { data, error } = await supabase.rpc('guest_join', { p_qr_token: qrToken, p_session_token: saved });
  if (error) { console.error('[GroupOrderService] guest_join failed (migration 0029 applied?)', error); return null; }
  if (!data) return null;
  if (data.closed || data.full) return 'closed';
  try { localStorage.setItem(storageKey(qrToken), data.session_token); } catch { /* private mode */ }
  return data.session_token as string;
}

/**
 * Close the table's active group: close the group + every guest session, which
 * invalidates all tokens and prevents further ordering. Rows are kept (archived).
 * Called by the cashier when a table's bill is paid/closed.
 */
export async function closeTableGroup(tableId: string): Promise<void> {
  const now = new Date().toISOString();
  const { data: groups } = await supabase
    .from('order_groups').select('id').eq('table_id', tableId).eq('status', 'active');
  const ids = (groups ?? []).map(g => g.id);
  if (ids.length === 0) return;

  await supabase.from('guest_sessions').update({ status: 'closed' }).in('group_id', ids);
  await supabase.from('order_groups').update({ status: 'closed', closed_at: now }).in('id', ids);
}
