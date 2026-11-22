/**
 * PrintService
 * 
 * Handles ESC/POS command generation and direct network printing for LAN printers.
 * This service bypasses the browser print dialog to enable "Silent Printing"
 * on Android and Desktop devices.
 */

import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from '../../lib/platform';

/** Native socket printing in the Android app (LanPrinterPlugin.java). */
export interface FoundPrinter { ip: string; port: number }

const LanPrinter = registerPlugin<{
  print(o: { host: string; port: number; data: string }): Promise<void>;
  discover(): Promise<{ printers: FoundPrinter[]; networks: string[] }>;
}>('LanPrinter');

/** Android app only: printers answering on port 9100 on the tablet's own network. */
export const findPrinters = () => LanPrinter.discover();

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

/** Strips control characters from printed data (a crafted name can't cut paper or open the drawer). */
export const cleanPrintText = (v: any) => String(v ?? '').replace(/[\x00-\x1F\x7F]/g, ' ').trimEnd();

export interface PrintJob {
  printerIp: string;
  printerPort: number;
  bytes: Uint8Array; // raw ESC/POS (raster image data has bytes >= 0x80)
}

/**
 * One printed line. Tickets are drawn as an image (see PrintService.render) because
 * printers can't print Arabic sent as text. `value` is drawn at the opposite edge
 * (prices, totals); 'rule' is a horizontal separator.
 */
export type PrintLine = 'rule' | {
  text: string;
  value?: string;
  style?: 'bold' | 'large';
  align?: 'left' | 'center' | 'right';
};

const RTL_CHARS = /[֐-ࣿיִ-﷿ﹰ-﻿]/;

/**
 * Packs 1-bit pixels (row-major, one array entry per pixel, non-zero = black) into a
 * full ESC/POS job: ESC @, GS v 0 raster bands of at most 255 rows (many printers
 * reject taller ones), three line feeds, then GS V 66 0 (feed to cutter and cut).
 */
export function rasterToEscPos(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const wb = Math.ceil(width / 8);
  const bands = Math.ceil(height / 255);
  const out = new Uint8Array(2 + bands * 8 + wb * height + 7);
  let o = 0;
  out[o++] = 0x1b; out[o++] = 0x40;
  for (let y0 = 0; y0 < height; y0 += 255) {
    const rows = Math.min(255, height - y0);
    out.set([0x1d, 0x76, 0x30, 0x00, wb & 0xff, wb >> 8, rows, 0], o); o += 8;
    for (let y = y0; y < y0 + rows; y++) {
      for (let x = 0; x < width; x++) {
        if (pixels[y * width + x]) out[o + (x >> 3)] |= 0x80 >> (x & 7);
      }
      o += wb;
    }
  }
  out.set([0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00], o);
  return out;
}

/** Greedy word wrap; keeps leading spaces (indents). shortcut: a single word wider than the paper is clipped, fine for menu names. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const tok of text.split(/(?<= )/)) {
    if (cur.trim() && ctx.measureText((cur + tok).trimEnd()).width > max) { out.push(cur.trimEnd()); cur = tok; }
    else cur += tok;
  }
  out.push(cur.trimEnd());
  return out;
}

export class PrintService {
  /**
   * Sends a print job to a LAN printer via a local relay or direct fetch if allowed.
   * Note: Most browsers block direct TCP/UDP. For a "Best" setup, we use a 
   * lightweight local relay or the Android WebView Bridge.
   */
  static async sendToPrinter(job: PrintJob): Promise<{ success: boolean; error?: string }> {
    console.log(`[PrintService] Sending job to ${job.printerIp}:${job.printerPort}`);
    
    // 1. The Android app sends the ticket straight to the printer's IP (port 9100).
    if (isNativeApp()) {
      try {
        await LanPrinter.print({ host: job.printerIp, port: job.printerPort || 9100, data: toBase64(job.bytes) });
        return { success: true };
      } catch (err: any) {
        // An app installed before this feature has no LanPrinter: fall through to the relay.
        if (err?.code !== 'UNIMPLEMENTED' && !/not implemented/i.test(String(err?.message))) {
          return { success: false, error: err?.message || 'Printer not reachable' };
        }
      }
    }

    try {

      // 2. Fallback: Use the AlnawrasPOS Print Proxy running on the Cashier device
      // We use the local network IP of your Cashier device here.
      const cashierIp = 'localhost'; // Change this to the Cashier's IP for tablet access
      const relayUrl = `http://${cashierIp}:3001/print`; 
      
      // Convert the bytes to a hex string the print proxy can turn back into bytes.
      const hex = Array.from(job.bytes, b => b.toString(16).padStart(2, '0')).join('');
      const payload = {
        ip: job.printerIp,
        port: job.printerPort,
        data: hex
      };

      const response = await fetch(relayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) return { success: true };
      throw new Error('Relay unreachable');
    } catch (err) {
      console.warn('[PrintService] Direct LAN print failed, falling back to browser print', err);
      return { success: false, error: 'Hardware bridge not found' };
    }
  }

  /**
   * Draws lines on a canvas at the paper width (80 mm = 576 dots, 58 mm = 384) and
   * returns ESC/POS raster bytes. The browser shapes Arabic and lays out right-to-left
   * text, which the printer's own text mode can't. Browser/WebView only (needs a DOM).
   */
  static render(lines: PrintLine[], paperWidth: 58 | 80 = 80): Uint8Array {
    const width = paperWidth === 58 ? 384 : 576;
    // 58 mm stays at 20 px, not 16: smaller Arabic is hard to read on thermal paper.
    const [normalPx, largePx] = paperWidth === 58 ? [20, 30] : [24, 36];
    const pad = 4, max = width - pad * 2, gap = 12, ruleH = 14;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available for printing');

    // Layout pass: wrap every line to the paper width and total the height.
    type Row = { text: string; value?: string; font: string; h: number; align: 'left' | 'center' | 'right'; rtl: boolean };
    const rows: (Row | 'rule')[] = [];
    let height = pad * 2;
    for (const l of lines) {
      if (l === 'rule') { rows.push('rule'); height += ruleH; continue; }
      const px = l.style === 'large' ? largePx : normalPx;
      const font = `${l.style ? 'bold ' : ''}${px}px sans-serif`;
      const rtl = RTL_CHARS.test(l.text);
      // Arabic lines read right-to-left from the right edge unless explicitly centered.
      const align = l.align === 'center' ? 'center' : rtl ? 'right' : (l.align ?? 'left');
      ctx.font = font;
      const valueW = l.value ? ctx.measureText(l.value).width + gap : 0;
      const h = Math.round(px * 1.35);
      wrap(ctx, l.text, Math.max(max / 3, max - valueW)).forEach((text, i) => {
        rows.push({ text, value: i === 0 ? l.value : undefined, font, h, align, rtl });
        height += h;
      });
    }

    // Draw pass (resizing the canvas resets the context state).
    canvas.height = height;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'middle';
    let y = pad;
    for (const r of rows) {
      if (r === 'rule') { ctx.fillRect(pad, y + ruleH / 2 - 1, max, 2); y += ruleH; continue; }
      ctx.font = r.font;
      ctx.direction = r.rtl ? 'rtl' : 'ltr';
      ctx.textAlign = r.align;
      ctx.fillText(r.text, r.align === 'center' ? width / 2 : r.align === 'right' ? width - pad : pad, y + r.h / 2);
      if (r.value) {
        const onLeft = r.align === 'right';
        ctx.direction = RTL_CHARS.test(r.value) ? 'rtl' : 'ltr';
        ctx.textAlign = onLeft ? 'left' : 'right';
        ctx.fillText(r.value, onLeft ? pad : width - pad, y + r.h / 2);
      }
      y += r.h;
    }

    // Threshold to 1-bit. Text is grey-on-white, so the red channel is enough; 160
    // (not 128) keeps anti-aliased edges, so thin strokes don't fade on thermal paper.
    const { data } = ctx.getImageData(0, 0, width, height);
    const pixels = new Uint8Array(width * height);
    for (let i = 0; i < pixels.length; i++) pixels[i] = data[i * 4] < 160 ? 1 : 0;
    return rasterToEscPos(pixels, width, height);
  }

  /** Test page for the Printers screen's Test button: `await PrintService.sendToPrinter(PrintService.testPage(printer))`. */
  static testPage(printer: { name: string; ipAddress?: string; port?: number; paperWidth?: 58 | 80 }): PrintJob {
    return {
      printerIp: printer.ipAddress ?? '',
      printerPort: printer.port || 9100,
      bytes: PrintService.render([
        { text: 'TEST PRINT', style: 'large', align: 'center' },
        { text: cleanPrintText(printer.name), align: 'center' },
        { text: new Date().toLocaleString(), align: 'center' },
        'rule',
        { text: 'اختبار الطباعة', style: 'large' },
        { text: '2x شاورما دجاج', value: '5,000' },
      ], printer.paperWidth),
    };
  }

  /**
   * Formats a kitchen ticket as print lines (draw with PrintService.render)
   */
  /** "TAKEAWAY #0003", "PICKUP #0007" or "TABLE 5". Takeaway/pickup get their number when
   *  created (a bill made offline gets it on sync); a dine-in bill only at payment. */
  static ticketLabel(order: { orderType?: string; tableNumber?: number; billNumber?: string | null }): string {
    const no = order.billNumber ? ` #${cleanPrintText(order.billNumber)}` : '';
    if (order.orderType === 'takeaway') return `TAKEAWAY${no}`;
    if (order.orderType === 'pickup') return `PICKUP${no}`;
    return `TABLE ${order.tableNumber ?? '?'}${no}`;
  }

  static formatKitchenTicket(order: any, newItems: any[], stationName: string): PrintLine[] {
    const now = new Date().toLocaleTimeString();
    // Map station IDs to friendly names for the header
    const stationDisplayNames: Record<string, string> = {
      kitchen: 'KITCHEN',
      juice: 'BEVERAGE',
      shawarma: 'SHAWARMA',
    };
    const title = stationDisplayNames[stationName] || stationName.toUpperCase();

    const lines: PrintLine[] = [
      { text: `${title} TICKET`, style: 'bold', align: 'center' },
      { text: PrintService.ticketLabel(order), style: 'large', align: 'center' },
      { text: `Time: ${now}`, align: 'center' },
      'rule',
    ];

    // Strip ASCII control characters from untrusted values (product names, notes,
    // modifier labels). The ticket is drawn as an image now, so this only keeps
    // stray tabs/newlines from garbling a line.
    const clean = cleanPrintText;

    newItems.forEach(item => {
      const name = clean(item.productName || item.product_name || 'Item');
      lines.push({ text: `${clean(item.quantity)}x ${name}`, style: 'large' });
      const mods = item.modifiers || item.modifiers_json || [];
      if (Array.isArray(mods)) {
        mods.forEach((m: any) => { lines.push({ text: `  - ${clean(m.optionName || m.option_name || '')}` }); });
      }
      if (item.notes) lines.push({ text: `  * NOTE: ${clean(item.notes)}`, style: 'bold' });
    });

    return lines;
  }
}
