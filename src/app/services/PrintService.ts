/**
 * PrintService
 * 
 * Handles ESC/POS command generation and direct network printing for LAN printers.
 * This service bypasses the browser print dialog to enable "Silent Printing"
 * on Android and Desktop devices.
 */

export interface PrintJob {
  printerIp: string;
  printerPort: number;
  content: string; // ESC/POS binary or formatted text
}

export class PrintService {
  /**
   * Sends a print job to a LAN printer via a local relay or direct fetch if allowed.
   * Note: Most browsers block direct TCP/UDP. For a "Best" setup, we use a 
   * lightweight local relay or the Android WebView Bridge.
   */
  static async sendToPrinter(job: PrintJob): Promise<{ success: boolean; error?: string }> {
    console.log(`[PrintService] Sending job to ${job.printerIp}:${job.printerPort}`);
    
    try {
      // 1. Check if we are running in an Android WebView with a Bridge
      if ((window as any).AndroidPrintBridge) {
        (window as any).AndroidPrintBridge.print(JSON.stringify(job));
        return { success: true };
      }

      // 2. Fallback: Use the AlnawrasPOS Print Proxy running on the Cashier device
      // We use the local network IP of your Cashier device here.
      const cashierIp = 'localhost'; // Change this to the Cashier's IP for tablet access
      const relayUrl = `http://${cashierIp}:3001/print`; 
      
      // Convert content to a hex string the print proxy can turn back into bytes.
      // Browsers have no Node `Buffer`, so encode with TextEncoder instead.
      const bytes = new TextEncoder().encode(job.content);
      const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
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
   * Formats a kitchen ticket in ESC/POS style
   */
  static formatKitchenTicket(order: any, newItems: any[], stationName: string): string {
    const now = new Date().toLocaleTimeString();
    // Map station IDs to friendly names for the header
    const stationDisplayNames: Record<string, string> = {
      kitchen: 'KITCHEN',
      juice: 'BEVERAGE',
      shawarma: 'SHAWARMA',
    };
    const title = stationDisplayNames[stationName] || stationName.toUpperCase();

    let esc = `\x1B\x40`; // Initialize
    esc += `\x1B\x61\x01`; // Center
    esc += `\x1D\x21\x11 ${title} TICKET \x1D\x21\x00\n`;
    esc += `--------------------------------\n`;
    esc += `Table: ${order.tableNumber} | Order: ${order.id.split('-').pop()}\n`;
    esc += `Time: ${now}\n`;
    esc += `--------------------------------\n`;
    esc += `\x1B\x61\x00`; // Left align
    
    // Strip ASCII control characters from untrusted values (product names, notes,
    // modifier labels) so a crafted string cannot inject ESC/POS control sequences
    // (paper cut, cash-drawer kick, garbled output). The formatter adds its own
    // control codes above; only interpolated data is sanitised here.
    const clean = (v: any) => String(v ?? '').replace(/[\x00-\x1F\x7F]/g, ' ').trimEnd();

    newItems.forEach(item => {
      const name = clean(item.productName || item.product_name || 'Item');
      esc += `\x1D\x21\x01${clean(item.quantity)}x ${name}\x1D\x21\x00\n`;
      const mods = item.modifiers || item.modifiers_json || [];
      if (Array.isArray(mods)) {
        mods.forEach((m: any) => { esc += `  - ${clean(m.optionName || m.option_name || '')}\n`; });
      }
      if (item.notes) esc += `  * NOTE: ${clean(item.notes)}\n`;
    });

    esc += `\n\n\n\n\x1B\x69`; // Cut paper
    return esc;
  }
}
