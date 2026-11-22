/**
 * One-time-purchase licences.
 *
 * A one-time customer runs on their OWN Supabase project. When the super-admin sets
 * them up, the main server's setup function signs a licence for that one project
 * with a private key that never leaves the main server (Edge Function secret
 * LICENSE_PRIVATE_KEY; backup outside the repo). The app checks the signature with
 * the public key below and that the licence names the project it is connected to,
 * so the system can't be copied to another project and resold.
 */
export const LICENSE_PUBLIC_KEY = 'QofQAdxZ4vOk5wJnJjA+15q4f0EG3TG0Au9MdRjrlKo=';

export interface LicenseData { v: 1; ref: string; tenant: string; issued: string }
/** As stored: the exact signed JSON text plus its Ed25519 signature (base64). */
export interface SignedLicense { payload: string; sig: string }

const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

/** "https://abcd….supabase.co" → "abcd…". */
export const projectRef = (url: string) => new URL(url).hostname.split('.')[0];

/** The licence's data when it is genuine and for this project; otherwise null. */
export async function verifyLicense(lic: SignedLicense | null | undefined, ref: string, publicKey = LICENSE_PUBLIC_KEY): Promise<LicenseData | null> {
  try {
    if (!lic?.payload || !lic?.sig) return null;
    const key = await crypto.subtle.importKey('raw', fromB64(publicKey), { name: 'Ed25519' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'Ed25519' }, key, fromB64(lic.sig), new TextEncoder().encode(lic.payload));
    if (!ok) return null;
    const data = JSON.parse(lic.payload) as LicenseData;
    return data.v === 1 && data.ref === ref ? data : null;
  } catch {
    return null;   // malformed, or this WebView can't check Ed25519 signatures
  }
}
