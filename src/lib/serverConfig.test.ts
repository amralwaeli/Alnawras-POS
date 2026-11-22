import { describe, it, expect, beforeEach } from 'vitest';
import { makeSetupCode, parseSetupCode, getSavedServer, switchServer } from './serverConfig';

// Like the browser's localStorage: stored items are its own keys, the methods are not.
const store: Record<string, string> = {};
Object.defineProperties(store, {
  getItem: { value: (k: string) => (k in store ? store[k] : null) },
  setItem: { value: (k: string, v: string) => { store[k] = String(v); } },
  removeItem: { value: (k: string) => { delete store[k]; } },
});
(globalThis as any).localStorage = store;
const mem = { set: (k: string, v: string) => { store[k] = v; }, keys: () => Object.keys(store), clear: () => Object.keys(store).forEach(k => delete store[k]) };

const good = { url: 'https://abcdefghijklmnopqrst.supabase.co', key: 'eyJhbGciOiJIUzI1NiJ9.payload.sig' };
beforeEach(() => mem.clear());

describe('own-server setup code', () => {
  it('round-trips a setup code', () => {
    expect(parseSetupCode(makeSetupCode(good))).toEqual(good);
    expect(parseSetupCode('  ' + makeSetupCode(good) + '\n')).toEqual(good);   // pasted with spaces
  });

  it('accepts only Supabase project addresses', () => {
    expect(parseSetupCode(makeSetupCode({ ...good, url: 'https://evil.example.com' }))).toBeNull();
    expect(parseSetupCode(makeSetupCode({ ...good, url: 'http://abcdefghijklmnopqrst.supabase.co' }))).toBeNull();
    expect(parseSetupCode(makeSetupCode({ ...good, key: 'short' }))).toBeNull();
    expect(parseSetupCode('not a code')).toBeNull();
  });

  it('switching forgets the old sign-in and offline PINs, and can go back', () => {
    mem.set('sb-old-auth-token', 'x'); mem.set('alnawras_device_branch', 'A'); mem.set('alnawras_offline_pins', 'x');
    expect(switchServer(good).ok).toBe(true);
    expect(getSavedServer()).toEqual(good);
    expect(mem.keys()).toEqual(['smartpos_server']);
    expect(switchServer(null).ok).toBe(true);
    expect(getSavedServer()).toBeNull();
  });

  it('keeps the sign-in just made on the new server', () => {
    mem.set('sb-oldoldoldoldoldoldo-auth-token', 'old'); mem.set('sb-abcdefghijklmnopqrst-auth-token', 'new');
    expect(switchServer(good, 'abcdefghijklmnopqrst').ok).toBe(true);
    expect(mem.keys().sort()).toEqual(['sb-abcdefghijklmnopqrst-auth-token', 'smartpos_server']);
  });

  it('refuses while offline bills wait to be sent', () => {
    mem.set('alnawras_offline_queue', '[{"id":1}]');
    expect(switchServer(good).error).toMatch(/waiting to be sent/);
    expect(getSavedServer()).toBeNull();
  });
});
