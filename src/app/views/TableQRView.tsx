import { useEffect, useRef } from 'react';
import { usePOS } from '../context/POSContext';
import QRCode from 'qrcode';
import { QrCode, Printer } from 'lucide-react';

export function TableQRView() {
  const { tables, currentUser } = usePOS();

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Only admins can access QR codes</p>
      </div>
    );
  }

  const handlePrintAll = () => {
    window.print();
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-2xl">Table QR Codes</h1>
            <p className="text-gray-600">Print QR codes for customer self-ordering</p>
          </div>
          <button
            onClick={handlePrintAll}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Printer className="size-4" />
            Print All QR Codes
          </button>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>How it works:</strong> Print these QR codes and place them on tables.
            Customers can scan to view menu and place orders directly to their table.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {tables.map(table => (
            <TableQRCard key={table.id} tableNumber={table.number} tableId={table.id} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TableQRCard({ tableNumber, tableId }: { tableNumber: number; tableId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      const url = `${window.location.origin}/table/${tableId}`;
      QRCode.toCanvas(canvasRef.current, url, {
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });
    }
  }, [tableId]);

  const handlePrintSingle = () => {
    const printWindow = window.open('', '', 'width=800,height=600');
    if (printWindow && canvasRef.current) {
      const qrDataUrl = canvasRef.current.toDataURL();
      printWindow.document.write(`
        <html>
          <head>
            <title>Table ${tableNumber} QR Code</title>
            <style>
              body {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
                font-family: system-ui, -apple-system, sans-serif;
              }
              h1 { font-size: 48px; margin-bottom: 20px; }
              img { border: 2px solid #000; }
              p { margin-top: 20px; font-size: 18px; }
            </style>
          </head>
          <body>
            <h1>Table ${tableNumber}</h1>
            <img src="${qrDataUrl}" alt="QR Code" />
            <p>Scan to view menu and order</p>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  return (
    <div className="bg-white border-2 rounded-lg p-6 text-center print:break-inside-avoid">
      <h3 className="font-semibold text-xl mb-4">Table {tableNumber}</h3>
      <div className="flex justify-center mb-4">
        <canvas ref={canvasRef} className="border-2 border-gray-300 rounded" />
      </div>
      <p className="text-sm text-gray-600 mb-2">Scan to order with this QR.</p>
      <p className="text-[11px] text-slate-500 mb-4 break-words">
        New link: <span className="font-semibold">{`${window.location.origin}/table/${tableId}`}</span>
      </p>
      <p className="text-[11px] text-slate-500 mb-4 break-words">
        Legacy link: <span className="font-semibold">{`${window.location.origin}/order/table-${tableNumber}`}</span>
      </p>
      <button
        onClick={handlePrintSingle}
        className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded hover:bg-gray-200 mx-auto print:hidden"
      >
        <Printer className="size-4" />
        Print
      </button>
    </div>
  );
}
