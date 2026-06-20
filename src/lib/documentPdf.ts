/**
 * documentPdf.ts
 *
 * Generates the Invoice / Quotation PDF directly with jsPDF (no html2canvas,
 * no extra dependencies) and delivers it in a way that works everywhere:
 *   - Admin website (desktop browser): a normal file download.
 *   - APK (Capacitor WebView): the native share sheet (Save to Files / Drive /
 *     print), because Android WebViews block silent blob/anchor downloads.
 */
import { jsPDF } from 'jspdf';

export interface PdfDocItem { name: string; qty: number; unitPrice: number; }

export interface PdfDocData {
  title: string;      // 'Invoice' | 'Quotation'
  refLabel: string;   // 'Invoice No' | 'Quotation No'
  to: { name: string; phone: string };
  refNo: string;
  date: string;
  items: PdfDocItem[];
  subTotal: number;
  discount: number;
  total: number;
  notes: string;
}

const RESTAURANT = {
  name: 'AL-NAWRAS RESTAURANT (1496779-P)',
  address: '29 Jalan Flora 1/9 Taman Pulai Flora 81300 Skudai Johor',
  phone: 'Phone: 018-7874994 / 018-7837567',
  email: 'E-Mail: alnawrasrestaurant23@gmail.com',
};

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const url = `${window.location.origin}${import.meta.env.BASE_URL}alnawras-logo.png`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function deliverPdf(doc: jsPDF, filename: string) {
  const blob = doc.output('blob');
  const isNative = !!(window as any).Capacitor?.isNativePlatform?.();

  // On the device, prefer the native share sheet — it lets the user save the
  // PDF to Files/Drive or print it. WebViews can't trigger a silent download.
  if (isNative && typeof navigator !== 'undefined') {
    try {
      const file = new File([blob], filename, { type: 'application/pdf' });
      const nav = navigator as any;
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: filename });
        return;
      }
    } catch {
      // user dismissed the share sheet, or sharing failed — fall through
      return;
    }
    // No file-share support: open the PDF so the system viewer can handle it.
    try { window.open(URL.createObjectURL(blob), '_blank'); } catch { /* ignore */ }
    return;
  }

  // Desktop / web: a normal download.
  doc.save(filename);
}

export async function generateDocumentPdf(data: PdfDocData, filename: string) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const left = 12;
  const right = pageW - 12; // 198
  let y = 18;

  // ── Title ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(data.title, pageW / 2, y, { align: 'center' });

  // ── Logo (top-right) ──
  const logo = await loadLogoDataUrl();
  if (logo) {
    try { doc.addImage(logo, 'PNG', right - 45, y - 4, 45, 28, undefined, 'FAST'); } catch { /* ignore */ }
  }

  // ── From ──
  y += 10;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('From', left, y);
  doc.text(RESTAURANT.name, left, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(RESTAURANT.address, left, y + 10);
  doc.text(RESTAURANT.phone, left, y + 15);
  doc.text(RESTAURANT.email, left, y + 20);

  // ── To + reference ──
  y += 32;
  doc.setFont('helvetica', 'bold');
  doc.text(`${data.title} To`, left, y);
  doc.setFont('helvetica', 'normal');
  doc.text(data.to.name || '', left, y + 5);
  doc.text(`Phone: ${data.to.phone || ''}`, left, y + 10);
  doc.text(`${data.refLabel} ${data.refNo}`, right, y, { align: 'right' });
  doc.text(`Date ${data.date}`, right, y + 5, { align: 'right' });

  // ── Items table ──
  y += 16;
  const rowH = 7;
  // header
  doc.setFillColor(240, 240, 240);
  doc.setDrawColor(180, 180, 180);
  doc.rect(left, y, right - left, rowH, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('No', left + 2, y + 5);
  doc.text('Items', left + 12, y + 5);
  doc.text('Qty', 128, y + 5, { align: 'center' });
  doc.text('Unit Price (RM)', 168, y + 5, { align: 'right' });
  doc.text('Total (RM)', right - 2, y + 5, { align: 'right' });
  y += rowH;

  doc.setFont('helvetica', 'normal');
  data.items.forEach((it, i) => {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.rect(left, y, right - left, rowH);
    doc.text(String(i + 1), left + 2, y + 5);
    const name = doc.splitTextToSize(it.name || '', 88)[0] ?? '';
    doc.text(name, left + 12, y + 5);
    doc.text(String(it.qty), 128, y + 5, { align: 'center' });
    doc.text(it.unitPrice.toFixed(2), 168, y + 5, { align: 'right' });
    doc.text((it.qty * it.unitPrice).toFixed(2), right - 2, y + 5, { align: 'right' });
    y += rowH;
  });

  // ── Totals ──
  y += 4;
  const tLeft = 128;
  const totals: [string, string, boolean][] = [
    ['Sub-Total (RM)', data.subTotal.toFixed(2), false],
    ['Discount (RM)', data.discount.toFixed(2), false],
    ['Total (RM)', data.total.toFixed(2), true],
  ];
  totals.forEach(([label, value, bold]) => {
    doc.rect(tLeft, y, right - tLeft, rowH);
    doc.line(168, y, 168, y + rowH);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(label, 166, y + 5, { align: 'right' });
    doc.text(value, right - 2, y + 5, { align: 'right' });
    y += rowH;
  });

  // ── Footer: Pay To + Notes ──
  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.text('Pay To', left, y);
  doc.setFont('helvetica', 'normal');
  doc.text('CIMB BANK', left, y + 5);
  doc.text('ALNAWRAS SDN BHD', left, y + 10);
  doc.text('8605525557', left, y + 15);

  doc.setFont('helvetica', 'bold');
  doc.text('Notes / Terms', left, y + 25);
  doc.setFont('helvetica', 'normal');
  doc.rect(left, y + 28, right - left, 22);
  const noteLines = doc.splitTextToSize(data.notes || '', right - left - 4);
  doc.text(noteLines, left + 2, y + 33);

  await deliverPdf(doc, filename);
}
