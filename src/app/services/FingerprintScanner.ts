/**
 * FingerprintScanner.ts
 *
 * Bridges the browser to USB fingerprint scanners via WebHID API.
 * Supports common HID fingerprint devices (ZFM-20, R307, DigitalPersona U.are.U, etc.)
 *
 * For production: replace the simulateCapture() stub with real
 * SDK calls from the manufacturer (e.g. DigitalPersona Web SDK,
 * Futronic SDK via native messaging, or SecuGen WebAPI).
 *
 * The interface intentionally mirrors the Web SDK pattern so
 * swapping implementations only requires changing this file.
 */

export type ScannerStatus = 'disconnected' | 'ready' | 'scanning' | 'processing' | 'error';

export interface ScanResult {
  success: boolean;
  template?: string;   // raw feature string
  quality?: number;    // 0-100
  error?: string;
}

export type ScannerCallback = (status: ScannerStatus, result?: ScanResult) => void;

// Known vendor IDs for common HID fingerprint scanners
const KNOWN_FINGERPRINT_VIDS = [
  { vendorId: 0x05ba }, // DigitalPersona / HID Global
  { vendorId: 0x1162 }, // Futronic
  { vendorId: 0x1491 }, // Identix
  { vendorId: 0x147e }, // Upek / AuthenTec
  { vendorId: 0x08ff }, // AuthenTec
  { vendorId: 0x0483 }, // SecuGen
  { vendorId: 0x1c7a }, // LighTuning
  { vendorId: 0x298d }, // Next Biometrics
];

export class FingerprintScanner {
  private static device: HIDDevice | null = null;
  private static isConnected = false;

  static isWebHIDSupported(): boolean {
    return 'hid' in navigator;
  }

  /**
   * Request user to select a HID fingerprint device.
   */
  static async connect(): Promise<{ success: boolean; deviceName?: string; error?: string }> {
    if (!FingerprintScanner.isWebHIDSupported()) {
      return {
        success: false,
        error: 'WebHID is not supported in this browser. Use Chrome 89+ or Edge 89+.',
      };
    }

    try {
      const devices = await (navigator as any).hid.requestDevice({
        filters: KNOWN_FINGERPRINT_VIDS,
      });

      if (!devices || devices.length === 0) {
        return { success: false, error: 'No fingerprint device selected' };
      }

      FingerprintScanner.device = devices[0];
      if (!FingerprintScanner.device!.opened) {
        await FingerprintScanner.device!.open();
      }
      FingerprintScanner.isConnected = true;
      return {
        success: true,
        deviceName: FingerprintScanner.device!.productName || 'USB Fingerprint Scanner',
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to connect to scanner' };
    }
  }

  static async disconnect(): Promise<void> {
    if (FingerprintScanner.device?.opened) {
      await FingerprintScanner.device.close();
    }
    FingerprintScanner.device = null;
    FingerprintScanner.isConnected = false;
  }

  static getConnectionStatus(): boolean {
    return FingerprintScanner.isConnected;
  }

  /**
   * Capture a fingerprint scan.
   *
   * In production this would:
   * 1. Send a "capture" command to the HID device
   * 2. Wait for the HID input report containing the image/template
   * 3. Extract and return the minutiae template
   *
   * Currently uses a simulation that generates a pseudo-unique
   * template string based on timing noise — replace with real SDK.
   */
  static async capture(timeoutMs = 10000): Promise<ScanResult> {
    if (!FingerprintScanner.isConnected) {
      // Demo/simulation mode when no real scanner is connected
      return FingerprintScanner.simulateCapture();
    }

    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout>;
      const onInputReport = (event: any) => {
        clearTimeout(timer);
        FingerprintScanner.device!.removeEventListener('inputreport', onInputReport);

        const data = new Uint8Array(event.data.buffer);
        // Parse response — device-specific; this is a generic stub
        if (data[0] === 0x00) {
          resolve({ success: false, error: 'Scan failed — no finger detected' });
        } else {
          const template = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('');
          const quality = Math.min(100, data[1] || 75);
          resolve({ success: true, template, quality });
        }
      };

      FingerprintScanner.device!.addEventListener('inputreport', onInputReport);

      // Send capture command (device-specific; 0x01 is a common "capture" command)
      const cmd = new Uint8Array([0x01, 0x00]);
      FingerprintScanner.device!.sendReport(0x00, cmd).catch((err: any) => {
        clearTimeout(timer);
        FingerprintScanner.device!.removeEventListener('inputreport', onInputReport);
        resolve({ success: false, error: err.message });
      });

      timer = setTimeout(() => {
        FingerprintScanner.device!.removeEventListener('inputreport', onInputReport);
        resolve({ success: false, error: 'Scan timeout — please try again' });
      }, timeoutMs);
    });
  }

  /**
   * Simulate a fingerprint scan for demo / development.
   * Generates a deterministic-looking template with timing jitter.
   */
  static async simulateCapture(forceEmployeeId?: string): Promise<ScanResult> {
    await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));
    // Generate a pseudo-template. In demo, same "session" produces same template.
    const seed = forceEmployeeId || `DEMO-${Date.now()}`;
    let template = '';
    for (let i = 0; i < 128; i++) {
      const code = ((seed.charCodeAt(i % seed.length) * (i + 1) * 7919) % 256);
      template += code.toString(16).padStart(2, '0');
    }
    return { success: true, template, quality: 88 + Math.floor(Math.random() * 10) };
  }

  /**
   * Helper: perform multiple scans and merge templates for better quality enrollment.
   * Returns the best scan result from N attempts.
   */
  static async multiScan(
    attempts: number,
    onProgress: (attempt: number, result: ScanResult) => void
  ): Promise<ScanResult> {
    let best: ScanResult = { success: false, error: 'No scans completed' };
    for (let i = 0; i < attempts; i++) {
      const result = await FingerprintScanner.capture();
      onProgress(i + 1, result);
      if (result.success && (!best.success || (result.quality || 0) > (best.quality || 0))) {
        best = result;
      }
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 500));
    }
    return best;
  }
}
