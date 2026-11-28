import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const print = vi.fn();
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ print: (o: unknown) => print(o) }) }));
vi.mock('../../lib/platform', () => ({ isNativeApp: () => true }));

import { PrintService } from './PrintService';

const job = { printerIp: '10.0.0.5', printerPort: 9100, bytes: new Uint8Array([0x1b, 0x40]) };

describe('PrintService.sendToPrinter timeout', () => {
  beforeEach(() => { vi.useFakeTimers(); print.mockReset(); });
  afterEach(() => { vi.useRealTimers(); });

  it('gives up on a printer that never answers', async () => {
    print.mockReturnValue(new Promise(() => {}));
    const res = PrintService.sendToPrinter(job);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(res).resolves.toEqual({ success: false, error: 'Printer did not answer in time' });
  });

  it('succeeds when the printer answers quickly, and clears the timer', async () => {
    print.mockResolvedValue(undefined);
    await expect(PrintService.sendToPrinter(job)).resolves.toEqual({ success: true });
    expect(vi.getTimerCount()).toBe(0);
  });
});
