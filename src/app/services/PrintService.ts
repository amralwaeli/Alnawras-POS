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

      // 2. Fallback: Use a local print relay (recommended for the "Best" setup)
      // This expects a tiny service running on the local network (e.g. at the cashier PC)
      const relayUrl = `http://localhost:9101/print`; // Standard local relay port
      const response = await fetch(relayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(job),
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
    
    newItems.forEach(item => {
      const name = item.productName || item.product_name || 'Item';
      esc += `\x1D\x21\x01${item.quantity}x ${name}\x1D\x21\x00\n`;
      if (item.notes) esc += `  * NOTE: ${item.notes}\n`;
    });

    esc += `\n\n\n\n\x1B\x69`; // Cut paper
    return esc;
  }
}
