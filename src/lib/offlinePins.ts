/**
 * Offline staff PIN sign-in (Android app only — see AuthContext.login).
 *
 * After a staff member signs in ONLINE on this device, a slow PBKDF2 hash of their
 * PIN is kept here, with their profile, so they can sign in on this device while
 * the internet is down. The PIN itself is never stored.
 *
 * Accepted risk (owner's decision, 2026-11-22): a 4-digit PIN has 10,000 values, so
 * someone who copies this device's storage can recover a PIN by trying them all.
 * Limits: entries expire 30 days after the last online sign-in, staff no longer
 * active are removed whenever the staff list loads online, 5 wrong PINs pause
 * offline sign-in for a minute, and signing the device out wipes everything.
 */
import type { User } from '../app/models/types';

const KEY = 'alnawras_offline_pins';
const LOCK_KEY = 'alnawras_offline_pin_lock';
const ITERATIONS = 150_000;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_WRONG = 5;
const LOCK_MS = 60_000;

interface Entry { hash: string; user: User; savedAt: number }
interface Store { salt: string; entries: Entry[] }

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

function read(): Store | null {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s?.salt && Array.isArray(s.entries) ? s : null; }
  catch { return null; }
}
function write(s: Store) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full: offline sign-in just won't work */ } }

async function hashPin(pin: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(salt), iterations: ITERATIONS }, key, 256);
  return b64(new Uint8Array(bits));
}

/** After a successful ONLINE sign-in: remember this PIN for offline use on this device. */
export async function rememberOfflinePin(pin: string, user: User): Promise<void> {
  const store = read() ?? { salt: b64(crypto.getRandomValues(new Uint8Array(16))), entries: [] };
  const hash = await hashPin(pin, store.salt);
  // One entry per person, and a PIN belongs to one person (PINs are unique per branch).
  store.entries = store.entries.filter(e => e.user.id !== user.id && e.hash !== hash);
  store.entries.push({ hash, user, savedAt: Date.now() });
  write(store);
}

/** Offline sign-in. Resolves the staff member, or an error message. */
export async function checkOfflinePin(pin: string): Promise<{ user?: User; error?: string }> {
  const lock = (() => { try { return JSON.parse(localStorage.getItem(LOCK_KEY) || '{"wrong":0,"until":0}'); } catch { return { wrong: 0, until: 0 }; } })();
  if (lock.until > Date.now()) return { error: 'Too many wrong PINs. Please wait a minute and try again.' };

  const store = read();
  const valid = (store?.entries ?? []).filter(e => Date.now() - e.savedAt < MAX_AGE_MS);
  if (!store || valid.length === 0) {
    return { error: 'No internet. Only staff who signed in on this device in the last 30 days can sign in offline.' };
  }
  const hash = await hashPin(pin, store.salt);
  const match = valid.find(e => e.hash === hash);
  const next = match ? { wrong: 0, until: 0 } : { wrong: lock.wrong + 1, until: lock.wrong + 1 >= MAX_WRONG ? Date.now() + LOCK_MS : 0 };
  try { localStorage.setItem(LOCK_KEY, JSON.stringify(next.until ? { wrong: 0, until: next.until } : next)); } catch { /* ignore */ }
  return match ? { user: match.user } : { error: 'Invalid PIN (offline: only staff who signed in on this device before).' };
}

/** When the staff list loads online: drop anyone who is no longer active. */
export function pruneOfflinePins(activeIds: string[]): void {
  const store = read();
  if (!store) return;
  const keep = new Set(activeIds);
  const entries = store.entries.filter(e => keep.has(e.user.id) && Date.now() - e.savedAt < MAX_AGE_MS);
  if (entries.length !== store.entries.length) write({ ...store, entries });
}

/** Device signed out of the branch: forget every offline PIN. */
export function clearOfflinePins(): void {
  try { localStorage.removeItem(KEY); localStorage.removeItem(LOCK_KEY); } catch { /* ignore */ }
}
