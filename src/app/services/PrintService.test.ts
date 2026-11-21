import { describe, it, expect, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({}) }));
vi.mock('../../lib/platform', () => ({ isNativeApp: () => false }));

import { rasterToEscPos } from './PrintService';

describe('rasterToEscPos', () => {
  it('packs pixels MSB-first and wraps them in init, GS v 0, feed and cut', () => {
    // 10 x 2 image: row 0 = first and last pixel black, row 1 = pixel 8 black.
    const px = new Uint8Array(20);
    px[0] = 1; px[9] = 1; px[18] = 1;
    const out = Array.from(rasterToEscPos(px, 10, 2));
    expect(out.slice(0, 2)).toEqual([0x1b, 0x40]);
    expect(out.slice(2, 10)).toEqual([0x1d, 0x76, 0x30, 0x00, 2, 0, 2, 0]); // 2 bytes wide, 2 rows
    expect(out.slice(10, 14)).toEqual([0x80, 0x40, 0x00, 0x80]);
    expect(out.slice(14)).toEqual([0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00]);
  });

  it('splits tall images into bands of at most 255 rows', () => {
    const width = 576, height = 600; // 72 bytes per row -> bands of 255, 255, 90
    const out = rasterToEscPos(new Uint8Array(width * height), width, height);
    expect(out.length).toBe(2 + 3 * 8 + 72 * height + 7);
    const headerAt = (o: number) => Array.from(out.slice(o, o + 8));
    expect(headerAt(2)).toEqual([0x1d, 0x76, 0x30, 0x00, 72, 0, 255, 0]);
    expect(headerAt(2 + 8 + 72 * 255)).toEqual([0x1d, 0x76, 0x30, 0x00, 72, 0, 255, 0]);
    expect(headerAt(2 + 2 * (8 + 72 * 255))).toEqual([0x1d, 0x76, 0x30, 0x00, 72, 0, 90, 0]);
  });
});
