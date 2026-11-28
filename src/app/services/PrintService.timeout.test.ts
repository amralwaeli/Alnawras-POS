import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const print = vi.fn();
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ print: (o: unknown) => print(o) }) }));
vi.mock('../../lib/platform', () => ({ isNativeApp: () => true }));

import { PrintService } from './PrintService';

const job = { printerIp: '10.0.0.5', printerPort: 9100, bytes: new Uint8Array([0x1b, 0x40]) };
const other = { ...job, printerIp: '10.0.0.6' };
const deferred = () => { let resolve!: () => void; const p = new Promise<void>(r => { resolve = r; }); return { p, resolve }; };

describe('PrintService.sendToPrinter timeout', () => {
  beforeEach(() => { vi.useFakeTimers(); print.mockReset(); });
  afterEach(() => { vi.useRealTimers(); });

  it('sends to one printer one after the other, and both print', async () => {
    const a = deferred(), b = deferred();
    print.mockReturnValueOnce(a.p).mockReturnValueOnce(b.p);
    const r1 = PrintService.sendToPrinter(job), r2 = PrintService.sendToPrinter(job);
    await vi.advanceTimersByTimeAsync(0);
    expect(print).toHaveBeenCalledTimes(1);   // second waits for the first
    a.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(print).toHaveBeenCalledTimes(2);
    b.resolve();
    await expect(r1).resolves.toEqual({ success: true });
    await expect(r2).resolves.toEqual({ success: true });
  });

  it('sends to different printers at the same time', async () => {
    const a = deferred(), b = deferred();
    print.mockReturnValueOnce(a.p).mockReturnValueOnce(b.p);
    const r1 = PrintService.sendToPrinter(job), r2 = PrintService.sendToPrinter(other);
    await vi.advanceTimersByTimeAsync(0);
    expect(print).toHaveBeenCalledTimes(2);
    a.resolve(); b.resolve();
    await expect(Promise.all([r1, r2])).resolves.toEqual([{ success: true }, { success: true }]);
  });

  it('gives up on a hung printer, refuses new sends to it until the old one settles', async () => {
    const hung = deferred();
    print.mockReturnValueOnce(hung.p);
    const res = PrintService.sendToPrinter(job);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(res).resolves.toEqual({ success: false, error: 'Printer did not answer in time' });

    // Still writing the old ticket: no second connection (it would print twice).
    await expect(PrintService.sendToPrinter(job)).resolves.toEqual({ success: false, error: 'Printer is still busy with the last ticket' });
    expect(print).toHaveBeenCalledTimes(1);

    hung.resolve();
    await vi.advanceTimersByTimeAsync(0);
    print.mockResolvedValueOnce(undefined);
    await expect(PrintService.sendToPrinter(job)).resolves.toEqual({ success: true });
    expect(print).toHaveBeenCalledTimes(2);
  });

  it('succeeds when the printer answers quickly, and clears the timer', async () => {
    print.mockResolvedValue(undefined);
    await expect(PrintService.sendToPrinter(job)).resolves.toEqual({ success: true });
    expect(vi.getTimerCount()).toBe(0);
  });
});
