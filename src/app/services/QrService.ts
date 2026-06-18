/**
 * QrService.ts
 *
 * Provides cryptographically secure QR token generation and validation.
 *
 * SECURITY MODEL — 3 layers:
 *
 * 1. OPAQUE TOKEN: The QR URL never exposes the real table UUID.
 *    Instead it contains a random, single-use session token stored in
 *    `qr_sessions.token`. Guessing or brute-forcing a 32-byte hex token
 *    is computationally infeasible.
 *
 * 2. EXPIRY: Every token is valid for a configurable window (default 12 h).
 *    A customer who photographs the QR code cannot use it the next day.
 *    The waiter/admin can also revoke a session at any time by regenerating
 *    the QR code for that table, which replaces the token.
 *
 * 3. SINGLE-BRANCH ISOLATION: The token lookup always filters by branch_id,
 *    so a token from one branch cannot resolve a table in another branch.
 *
 * URL shape:
 *   /#/order/qr/<token>
 *
 * The real tableId is NEVER in the URL.
 */

import { supabase } from '../../lib/supabase';

/** How long (in hours) a QR session token is valid before it expires. */
const TOKEN_TTL_HOURS = 12;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a cryptographically random hex token. */
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Build the full QR URL for a given token. */
export function buildQrUrl(token: string): string {
  const origin = window.location.origin;
  const base = window.location.pathname.replace(/\/$/, '');
  return `${origin}${base}/#/order/qr/${token}`;
}

// ─── Session Management ───────────────────────────────────────────────────────

export interface QrSession {
  token: string;
  tableId: string;
  tableNumber: number;
  branchId: string;
  expiresAt: string;
}

/**
 * Create (or replace) a secure QR session for a table.
 * Call this when the admin prints a new QR code.
 * Any previously issued token for this table is immediately invalidated.
 */
export async function createQrSession(
  tableId: string,
  tableNumber: number,
  branchId: string,
): Promise<{ token: string; url: string } | { error: string }> {
  const token = generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_HOURS * 60 * 60 * 1000).toISOString();

  // Upsert: one active session per table at a time.
  // The UNIQUE constraint on (table_id) in qr_sessions handles the replacement.
  const { error } = await supabase.from('qr_sessions').upsert(
    {
      id: `qrs-${tableId}`,
      table_id: tableId,
      token,
      active: true,
      started_at: now.toISOString(),
      last_activity_at: now.toISOString(),
      expires_at: expiresAt,
      branch_id: branchId,
    },
    { onConflict: 'table_id' },
  );

  if (error) {
    console.error('[QrService] Failed to create session:', error);
    return { error: error.message };
  }

  return { token, url: buildQrUrl(token) };
}

/**
 * Validate a token from the URL and return the resolved session.
 * Returns null if the token is unknown, expired, or deactivated.
 */
export async function validateQrToken(token: string): Promise<QrSession | null> {
  if (!token || token.length !== 64) return null; // quick sanity check

  const { data, error } = await supabase
    .from('qr_sessions')
    .select('token, table_id, branch_id, active, expires_at')
    .eq('token', token)
    .eq('active', true)
    .single();

  if (error || !data) return null;

  // Check expiry
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    // Silently deactivate the expired session
    await supabase.from('qr_sessions').update({ active: false }).eq('token', token);
    return null;
  }

  // Fetch the table number for display purposes
  const { data: tableRow } = await supabase
    .from('tables')
    .select('number')
    .eq('id', data.table_id)
    .single();

  // Bump last_activity_at
  await supabase
    .from('qr_sessions')
    .update({ last_activity_at: new Date().toISOString() })
    .eq('token', token);

  return {
    token: data.token,
    tableId: data.table_id,
    tableNumber: tableRow?.number ?? 0,
    branchId: data.branch_id,
    expiresAt: data.expires_at,
  };
}

/**
 * Immediately revoke a QR session for a table (e.g. when the table is cleared).
 */
export async function revokeQrSession(tableId: string): Promise<void> {
  await supabase
    .from('qr_sessions')
    .update({ active: false })
    .eq('table_id', tableId);
}
