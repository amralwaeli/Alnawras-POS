import { describe, it, expect, beforeAll } from 'vitest';
import { verifyLicense, projectRef, type SignedLicense } from './license';

// A throwaway key pair for the tests (the real private key is never in the repo).
let pub = '';
let sign: (payload: string) => Promise<SignedLicense>;
beforeAll(async () => {
  const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair;
  pub = Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey)).toString('base64');
  sign = async (payload) => ({
    payload,
    sig: Buffer.from(await crypto.subtle.sign({ name: 'Ed25519' }, kp.privateKey, new TextEncoder().encode(payload))).toString('base64'),
  });
});

const data = (ref: string) => JSON.stringify({ v: 1, ref, tenant: 'Cafe A', issued: '2026-11-23' });

describe('one-time licence', () => {
  it('accepts a genuine licence for this project', async () => {
    expect((await verifyLicense(await sign(data('abcdefghijklmnopqrst')), 'abcdefghijklmnopqrst', pub))?.tenant).toBe('Cafe A');
  });

  it('refuses a licence copied to another project', async () => {
    expect(await verifyLicense(await sign(data('abcdefghijklmnopqrst')), 'zzzzzzzzzzzzzzzzzzzz', pub)).toBeNull();
  });

  it('refuses an edited licence or a missing one', async () => {
    const lic = await sign(data('abcdefghijklmnopqrst'));
    expect(await verifyLicense({ ...lic, payload: lic.payload.replace('Cafe A', 'Cafe B') }, 'abcdefghijklmnopqrst', pub)).toBeNull();
    expect(await verifyLicense(null, 'abcdefghijklmnopqrst', pub)).toBeNull();
    expect(await verifyLicense({ payload: 'x', sig: 'not base64!' }, 'abcdefghijklmnopqrst', pub)).toBeNull();
  });

  it('refuses a licence signed with a different key (the real key here)', async () => {
    expect(await verifyLicense(await sign(data('abcdefghijklmnopqrst')), 'abcdefghijklmnopqrst')).toBeNull();
  });

  it('reads the project id from its address', () => {
    expect(projectRef('https://abcdefghijklmnopqrst.supabase.co')).toBe('abcdefghijklmnopqrst');
  });
});
