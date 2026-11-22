import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { rememberOfflinePin, checkOfflinePin, pruneOfflinePins, clearOfflinePins } from './offlinePins';

// Node has no localStorage: a tiny in-memory one.
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
};

const ali = { id: 'ali', name: 'Ali', role: 'cashier', branchId: 'A' } as any;
const sara = { id: 'sara', name: 'Sara', role: 'waiter', branchId: 'A' } as any;

beforeEach(() => mem.clear());
afterEach(() => vi.useRealTimers());

describe('offline PIN sign-in', () => {
  it('signs in a remembered PIN and never stores the PIN itself', async () => {
    await rememberOfflinePin('1234', ali);
    expect([...mem.values()].join()).not.toContain('1234');
    expect((await checkOfflinePin('1234')).user?.id).toBe('ali');
  });

  it('refuses a wrong PIN and an unknown device', async () => {
    expect((await checkOfflinePin('1234')).error).toMatch(/last 30 days/);
    await rememberOfflinePin('1234', ali);
    expect((await checkOfflinePin('9999')).error).toMatch(/Invalid PIN/);
  });

  it('pauses for a minute after 5 wrong PINs', async () => {
    await rememberOfflinePin('1234', ali);
    for (let i = 0; i < 5; i++) await checkOfflinePin('0000');
    expect((await checkOfflinePin('1234')).error).toMatch(/wait a minute/);
  });

  it('forgets staff who are no longer active, and everything on device sign-out', async () => {
    await rememberOfflinePin('1234', ali);
    await rememberOfflinePin('5678', sara);
    pruneOfflinePins(['sara']);
    expect((await checkOfflinePin('1234')).user).toBeUndefined();
    expect((await checkOfflinePin('5678')).user?.id).toBe('sara');
    clearOfflinePins();
    expect((await checkOfflinePin('5678')).error).toMatch(/last 30 days/);
  });

  it('expires 30 days after the last online sign-in', async () => {
    await rememberOfflinePin('1234', ali);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 31 * 24 * 60 * 60 * 1000);
    expect((await checkOfflinePin('1234')).error).toMatch(/last 30 days/);
  });

  it('a changed PIN replaces the old one', async () => {
    await rememberOfflinePin('1234', ali);
    await rememberOfflinePin('4321', ali);
    expect((await checkOfflinePin('1234')).user).toBeUndefined();
    expect((await checkOfflinePin('4321')).user?.id).toBe('ali');
  });
});
