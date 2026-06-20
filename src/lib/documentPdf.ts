/**
 * documentPdf.ts
 *
 * Turns the on-page Invoice / Quotation template into a PDF by rasterising the
 * actual HTML element with html2canvas (so Arabic / Unicode text renders exactly
 * like the browser shows it — jsPDF's built-in fonts are Latin-only), then
 * delivers it:
 *   - Admin website (desktop): handled by window.print() in the views.
 *   - APK (Capacitor): native share/save sheet via Filesystem + Share plugins.
 *   - Fallbacks: Web Share, download, or open in the system browser.
 */
import { jsPDF } from 'jspdf';

/**
 * True when we should build a PDF and share it instead of using the browser
 * print dialog: i.e. inside the Capacitor APK, or any Android/iOS browser
 * (these have no reliable "Save as PDF" print dialog). Desktop returns false
 * so the admin site keeps its print dialog.
 */
export function preferGeneratedPdf(): boolean {
  const cap: any = (window as any).Capacitor;
  if (cap) {
    try { if (typeof cap.isNativePlatform === 'function') return !!cap.isNativePlatform(); } catch { /* ignore */ }
    // Capacitor global is injected only inside the native app → treat as native.
    return true;
  }
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const s = typeof reader.result === 'string' ? reader.result : '';
      resolve(s.includes(',') ? s.split(',')[1] : s);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** No-reinstall fallback: hand the PDF to the system browser as a data URL,
 *  where it can be viewed, saved, or shared. Opened via a target=_blank anchor
 *  so Capacitor routes it to the external browser. */
function openInSystemBrowser(doc: jsPDF) {
  const dataUri = doc.output('datauristring');
  try {
    const a = document.createElement('a');
    a.href = dataUri;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    try { window.open(dataUri, '_blank'); } catch { /* ignore */ }
  }
}

async function deliverPdf(doc: jsPDF, filename: string) {
  const blob = doc.output('blob');
  const cap: any = (window as any).Capacitor;
  const isNative = !!cap && (typeof cap.isNativePlatform === 'function' ? cap.isNativePlatform() : true);

  // ── Native app (APK) ──
  if (isNative) {
    // Best path: native Filesystem + Share plugins (only present if the APK was
    // rebuilt with them). Reliable "Save to Files / Drive / print".
    try {
      const base64 = await blobToBase64(blob);
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const written = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
      try { await Share.share({ title: filename, url: written.uri }); } catch { /* dismissed */ }
      return;
    } catch (pluginErr) {
      // Plugin not in the installed APK (no reinstall yet) → no-reinstall path:
      // open the PDF in the system browser instead.
      console.warn('[documentPdf] native plugin unavailable, opening in browser', pluginErr);
      openInSystemBrowser(doc);
      return;
    }
  }

  // ── Web/mobile-browser fallbacks: file share if available, else download ──
  try {
    const file = new File([blob], filename, { type: 'application/pdf' });
    const nav = navigator as any;
    if (nav.canShare && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], title: filename });
      return;
    }
  } catch (e: any) {
    if (e && e.name === 'AbortError') return; // user closed the share sheet
  }
  try { doc.save(filename); return; } catch { /* ignore */ }
  openInSystemBrowser(doc);
}

/**
 * Rasterise a DOM element (the A4 invoice/quotation template) into a PDF and
 * deliver it. Capturing the real HTML means Arabic and any other Unicode text
 * comes out exactly as the browser renders it.
 */
export async function exportElementAsPdf(el: HTMLElement, filename: string) {
  const html2canvas = (await import('html2canvas')).default;
  const canvas = await html2canvas(el, {
    scale: 2,                 // sharper text
    backgroundColor: '#ffffff',
    useCORS: true,            // allow the logo image
    logging: false,
  });

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;
  const img = canvas.toDataURL('image/jpeg', 0.95);

  // Add the image, paginating if the content is taller than one A4 page.
  let heightLeft = imgH;
  let position = 0;
  doc.addImage(img, 'JPEG', 0, position, imgW, imgH);
  heightLeft -= pageH;
  while (heightLeft > 0) {
    position -= pageH;
    doc.addPage();
    doc.addImage(img, 'JPEG', 0, position, imgW, imgH);
    heightLeft -= pageH;
  }

  await deliverPdf(doc, filename);
}
