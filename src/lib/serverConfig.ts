/**
 * Which Supabase project this device talks to.
 *
 * Subscription customers use the build's project (VITE_SUPABASE_URL). A one-time
 * customer runs on their OWN free Supabase project: scripts/new-customer.mjs prints
 * a setup code, typed once on each device's sign-in screen. The code only holds
 * the project address and its public anon key (never the service-role key), and
 * only *.supabase.co projects are accepted (the page's CSP allows nothing else).
 */
const KEY = 'smartpos_server';

export interface ServerConfig { url: string; key: string }

const URL_RE = /^https:\/\/[a-z0-9]{20}\.supabase\.co$/;
const KEY_RE = /^[A-Za-z0-9._-]{20,}$/;
const valid = (c: any): c is ServerConfig => !!c && URL_RE.test(c.url) && KEY_RE.test(c.key);

/** Setup code = base64 of {"u": project url, "k": anon key}. */
export const makeSetupCode = (c: ServerConfig) => btoa(JSON.stringify({ u: c.url, k: c.key }));

export function parseSetupCode(code: string): ServerConfig | null {
  try {
    const o = JSON.parse(atob(code.replace(/\s+/g, '')));
    const c = { url: String(o.u ?? '').replace(/\/+$/, ''), key: String(o.k ?? '') };
    return valid(c) ? c : null;
  } catch { return null; }
}

export function getSavedServer(): ServerConfig | null {
  try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); return valid(c) ? c : null; }
  catch { return null; }
}

/** Switch server (null = back to the default). Forgets the old server's sign-in and
 *  offline data; refused while bills made offline still wait to be sent. */
export function switchServer(c: ServerConfig | null): { ok: boolean; error?: string } {
  try {
    if (JSON.parse(localStorage.getItem('alnawras_offline_queue') || '[]').length > 0) {
      return { ok: false, error: 'Bills made offline are still waiting to be sent. Connect to the internet first.' };
    }
    for (const k of Object.keys(localStorage)) {
      if (/^sb-.+-auth-token/.test(k) || ['alnawras_device_branch', 'alnawras_offline_pins', 'alnawras_offline_pin_lock'].includes(k)) localStorage.removeItem(k);
    }
    if (c) localStorage.setItem(KEY, JSON.stringify(c)); else localStorage.removeItem(KEY);
    return { ok: true };
  } catch { return { ok: false, error: 'This device could not save the setting.' }; }
}
