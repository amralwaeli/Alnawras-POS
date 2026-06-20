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

/** RFC 9562 UUIDv7: 48-bit big-endian timestamp + version/variant + randomness. */
export function uuidv7(): string {
  const ts = Date.now();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[0] = Math.floor(ts / 2 ** 40) & 0xff;
  b[1] = Math.floor(ts / 2 ** 32) & 0xff;
  b[2] = Math.floor(ts / 2 ** 24) & 0xff;
  b[3] = Math.floor(ts / 2 ** 16) & 0xff;
  b[4] = Math.floor(ts / 2 ** 8) & 0xff;
  b[5] = ts & 0xff;
  b[6] = (b[6] & 0x0f) | 0x70; // version 7
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

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

export interface GuestSession {
  sessionId: string;       // UUIDv7
  sessionToken: string;    // stored client-side to resume on refresh
  groupId: string;
  guestLabel: string;
  tableId: string;
  tableNumber: number;
  branchId: string;
}

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

// ── Internal: find or create the active group for a table ─────────────────────

async function getOrCreateActiveGroup(tableId: string, branchId: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from('order_groups').select('id').eq('table_id', tableId).eq('status', 'active').maybeSingle();
  if (existing?.id) return existing.id;

  const id = uuidv7();
  const { error } = await supabase.from('order_groups').insert({
    id, table_id: tableId, branch_id: branchId, status: 'active',
  });
  if (!error) return id;

  // Lost a race against another device — re-read the now-existing active group.
  const { data: again } = await supabase
    .from('order_groups').select('id').eq('table_id', tableId).eq('status', 'active').maybeSingle();
  return again?.id ?? null;
}

// ── Join the table: resolve QR → active group → new (or resumed) guest session ─

export async function joinTable(qrToken: string): Promise<GuestSession | null> {
  if (!qrToken) return null;

  // Resolve the table from the stable QR token (the UUID never leaves the server).
  const { data: table } = await supabase
    .from('tables').select('id, number, branch_id').eq('qr_token', qrToken).maybeSingle();
  if (!table) return null;

  // Resume an existing session for this device if it's still valid.
  const saved = localStorage.getItem(storageKey(qrToken));
  if (saved) {
    const session = await validateSession(saved);
    if (session && session.tableId === table.id) return session;
    localStorage.removeItem(storageKey(qrToken)); // stale / closed — drop it
  }

  const groupId = await getOrCreateActiveGroup(table.id, table.branch_id);
  if (!groupId) return null;

  // Number this guest within the group.
  const { count } = await supabase
    .from('guest_sessions').select('*', { count: 'exact', head: true }).eq('group_id', groupId);
  const guestLabel = `Guest ${(count ?? 0) + 1}`;

  const sessionId = uuidv7();
  const sessionToken = randomToken();
  const { error } = await supabase.from('guest_sessions').insert({
    id: sessionId, group_id: groupId, table_id: table.id, branch_id: table.branch_id,
    token: sessionToken, guest_label: guestLabel, status: 'active',
  });
  if (error) return null;

  localStorage.setItem(storageKey(qrToken), sessionToken);
  return {
    sessionId, sessionToken, groupId, guestLabel,
    tableId: table.id, tableNumber: table.number, branchId: table.branch_id,
  };
}

/** Validate a stored guest token: must be an active session in an active group. */
export async function validateSession(sessionToken: string): Promise<GuestSession | null> {
  if (!sessionToken || sessionToken.length !== 64) return null;
  const { data } = await supabase
    .from('guest_sessions')
    .select('id, group_id, table_id, branch_id, guest_label, status, order_groups(status), tables(number)')
    .eq('token', sessionToken)
    .maybeSingle();
  if (!data || data.status !== 'active') return null;
  const groupStatus = (data as any).order_groups?.status;
  if (groupStatus !== 'active') return null;

  void supabase.from('guest_sessions').update({ last_seen: new Date().toISOString() }).eq('token', sessionToken);
  return {
    sessionId: data.id,
    sessionToken,
    groupId: data.group_id,
    guestLabel: data.guest_label ?? 'Guest',
    tableId: data.table_id,
    tableNumber: (data as any).tables?.number ?? 0,
    branchId: data.branch_id,
  };
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
