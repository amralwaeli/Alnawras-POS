import { useEffect, useRef, useState, useCallback } from 'react';
import { usePOS } from '../../context/POSContext';
import QRCode from 'qrcode';
import { QrCode, Printer, RefreshCw, ShieldCheck, Clock } from 'lucide-react';
import { ensureTableQrToken, rotateTableQrToken, buildGroupOrderUrl } from '../../services/GroupOrderService';

export function TableQRView() {
  const { tables, currentUser } = usePOS();

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Only admins can access QR codes</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-2xl">Table QR Codes</h1>
            <p className="text-gray-600">Print QR codes for customer self-ordering</p>
          </div>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Printer className="size-4" />
            Print All QR Codes
          </button>
        </div>

        {/* Security notice */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
          <ShieldCheck className="size-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-emerald-800">Secure Group QR Codes Active</p>
            <p className="text-xs text-emerald-700 mt-0.5">
              Each QR holds a random token identifying the table only — the real table ID is never exposed.
              The code is <strong>reusable</strong>: every customer at the table can scan and order together,
              and it automatically starts a fresh group after the bill is paid. Use <strong>Regenerate</strong>
              to instantly invalidate a printed code.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {tables.map(table => (
            <TableQRCard
              key={table.id}
              tableNumber={table.number}
              tableId={table.id}
              branchId={table.branchId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Individual QR Card ───────────────────────────────────────────────────────

function TableQRCard({
  tableNumber,
  tableId,
  branchId,
}: {
  tableNumber: number;
  tableId: string;
  branchId: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [token, setToken] = useState<string | null>(null);
  const [url, setUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load the table's STABLE QR token (reusable across many dining groups).
  const loadToken = useCallback(async () => {
    setLoading(true);
    setError(null);
    const t = await ensureTableQrToken(tableId);
    if (!t) { setError('Could not load QR token'); setLoading(false); return; }
    setToken(t);
    setUrl(buildGroupOrderUrl(t));
    setLoading(false);
  }, [tableId]);

  // Rotate the token — invalidates the old printed QR.
  const regenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    const t = await rotateTableQrToken(tableId);
    if (!t) { setError('Could not regenerate QR token'); setLoading(false); return; }
    setToken(t);
    setUrl(buildGroupOrderUrl(t));
    setLoading(false);
  }, [tableId]);

  useEffect(() => { void loadToken(); }, [loadToken]);

  // Render QR code whenever the URL changes
  useEffect(() => {
    if (!url || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, url, {
      width: 200,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    });
  }, [url]);

  const handlePrintSingle = () => {
    if (!canvasRef.current) return;
    const printWindow = window.open('', '', 'width=800,height=600');
    if (!printWindow) return;
    const qrDataUrl = canvasRef.current.toDataURL();
    printWindow.document.write(`
      <html>
        <head>
          <title>Table ${tableNumber} QR Code</title>
          <style>
            body {
              display: flex; flex-direction: column;
              align-items: center; justify-content: center;
              height: 100vh; margin: 0;
              font-family: system-ui, -apple-system, sans-serif;
            }
            h1 { font-size: 48px; margin-bottom: 20px; }
            img { border: 2px solid #000; }
            p { margin-top: 20px; font-size: 18px; color: #555; }
            .token { font-size: 10px; color: #aaa; margin-top: 8px; word-break: break-all; max-width: 220px; text-align: center; }
          </style>
        </head>
        <body>
          <h1>Table ${tableNumber}</h1>
          <img src="${qrDataUrl}" alt="QR Code" />
          <p>Scan to view menu and order</p>
          <p class="token">Token: ${token?.slice(0, 16)}…</p>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="bg-white border-2 rounded-xl p-6 text-center print:break-inside-avoid shadow-sm">
      <h3 className="font-semibold text-xl mb-4">Table {tableNumber}</h3>

      <div className="flex justify-center mb-4 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-lg z-10">
            <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <canvas ref={canvasRef} className="border-2 border-gray-200 rounded-lg" />
      </div>

      {error && (
        <p className="text-xs text-red-500 mb-3">Error: {error}</p>
      )}

      {/* Token preview — shows only first 16 chars for security */}
      {token && !loading && (
        <div className="flex items-center justify-center gap-1.5 mb-3">
          <Clock className="size-3 text-gray-400" />
          <p className="text-[10px] text-gray-400 font-mono">
            Token: {token.slice(0, 16)}… · Reusable · Multi-device
          </p>
        </div>
      )}

      <div className="flex gap-2 justify-center">
        <button
          onClick={handlePrintSingle}
          disabled={loading || !!error}
          className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm font-medium print:hidden disabled:opacity-40"
        >
          <Printer className="size-4" />
          Print
        </button>
        <button
          onClick={regenerate}
          disabled={loading}
          title="Regenerate — this invalidates the old QR code immediately"
          className="flex items-center gap-2 px-3 py-2 bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 text-sm font-medium print:hidden disabled:opacity-40"
        >
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          Regenerate
        </button>
      </div>
    </div>
  );
}
