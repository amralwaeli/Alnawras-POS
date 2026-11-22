import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { CURRENCY, fmt } from '../../../lib/currency';
import { QrCode, CheckCircle, ShoppingCart, User } from 'lucide-react';
import QRCode from 'qrcode';
import { usePOS } from '../../context/POSContext';
import { useBranch } from '../../context/BranchContext';
import { DeviceService } from '../../services/DeviceService';

export function CustomerMonitorView() {
  const { currentUser } = usePOS();
  const { businessName } = useBranch();
  const [order, setOrder] = useState<any>(null);
  const [paymentQR, setPaymentQR] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);

  // Drawn locally — the bill details used to be sent to a third-party QR service.
  useEffect(() => {
    if (!paymentQR) { setQrImage(null); return; }
    QRCode.toDataURL(paymentQR, { width: 250, margin: 1 }).then(setQrImage, () => setQrImage(null));
  }, [paymentQR]);

  useEffect(() => {
    // Listen for broadcast messages from the cashier window
    if (!currentUser) return;
    const channel = supabase.channel(DeviceService.customerMonitorChannel(currentUser.branchId))
      .on('broadcast', { event: 'update-bill' }, (payload) => {
        setOrder(payload.payload.order);
        setPaymentQR(payload.payload.paymentQR || null);
      })
      .on('broadcast', { event: 'payment-success' }, () => {
        setPaymentQR(null);
        // Show success for 5 seconds then clear
        setTimeout(() => setOrder(null), 5000);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentUser?.branchId]);

  if (!order) {
    return (
      <div className="min-h-dvh bg-[#0B0E14] flex flex-col items-center justify-center text-white p-6 sm:p-12 text-center">
        <div className="bg-orange-500/10 p-6 sm:p-8 rounded-[40px] sm:rounded-[60px] mb-6 sm:mb-8">
          <ShoppingCart className="size-20 sm:size-32 text-orange-500 opacity-20" />
        </div>
        <h1 dir="auto" className="text-3xl sm:text-5xl font-black italic tracking-tighter uppercase mb-4 break-words max-w-full">Welcome to {businessName}</h1>
        <p className="text-base sm:text-xl text-gray-500 max-w-md">Please check your items on this screen before payment.</p>
      </div>
    );
  }

  const subtotal = (order.items || []).reduce((s: number, i: any) => s + (Number(i.price) * Number(i.quantity)), 0);
  const tax = Number(order.tax || 0);
  const total = Math.max(0, subtotal + tax - (Number(order.discount) || 0));

  return (
    <div className="h-dvh bg-white flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
      {/* Left Side: Order Items */}
      <div className="lg:flex-1 lg:min-h-0 min-w-0 flex flex-col p-4 sm:p-6 xl:p-12 bg-gray-50">
        <div className="flex items-center gap-4 mb-6 xl:mb-12 shrink-0">
          <div className="size-12 sm:size-16 shrink-0 bg-orange-500 rounded-2xl flex items-center justify-center text-white text-2xl sm:text-3xl font-black italic">A</div>
          <div className="min-w-0">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">YOUR ORDER</h2>
            <p className="text-gray-500 font-medium uppercase tracking-widest text-sm">Table {order.tableNumber || 'Takeaway'}</p>
          </div>
        </div>

        <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto space-y-3 sm:space-y-6 lg:pr-4 custom-scroll">
          {order.items.map((item: any) => (
            <div key={item.id} className="flex items-center justify-between gap-3 bg-white p-4 sm:p-6 rounded-[24px] sm:rounded-[32px] shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 sm:gap-6 min-w-0">
                <div className="size-10 sm:size-12 shrink-0 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600 font-bold text-base sm:text-xl">×{item.quantity}</div>
                <span dir="auto" className="text-lg sm:text-2xl font-bold text-gray-800 min-w-0 break-words">{item.productName}</span>
              </div>
              <span className="text-lg sm:text-2xl font-black text-gray-900 whitespace-nowrap shrink-0">{fmt(item.price * item.quantity)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right Side: Payment Info */}
      <div className="w-full lg:w-[400px] xl:w-[450px] lg:shrink-0 lg:min-h-0 lg:overflow-y-auto bg-white border-t-2 lg:border-t-0 lg:border-l-2 border-gray-100 flex flex-col p-4 sm:p-6 xl:p-12">
        <div className="flex-1 flex flex-col justify-center text-center space-y-6 xl:space-y-8">
          {paymentQR ? (
            <div className="space-y-6 animate-in fade-in zoom-in duration-500">
              <div className="bg-violet-50 p-4 sm:p-8 rounded-[32px] sm:rounded-[40px] border-2 border-violet-100 inline-block mx-auto max-w-full">
                <img
                  src={qrImage ?? undefined}
                  alt="Payment QR"
                  className="size-56 sm:size-64 max-w-full"
                />
              </div>
              <div>
                <h3 className="text-2xl font-black text-violet-700 uppercase tracking-tight">Scan to Pay</h3>
                <p className="text-gray-500 font-medium">Please scan the QR code to complete your payment.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="size-24 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="size-12 text-emerald-600" />
              </div>
              <h3 className="text-3xl font-black text-gray-900">Review Bill</h3>
              <p className="text-gray-500 font-medium">Total items: {order.items.length}</p>
            </div>
          )}
        </div>

        <div className="mt-auto space-y-3 sm:space-y-4 pt-6 xl:pt-12 border-t-2 border-dashed border-gray-200">
          <div className="flex justify-between gap-3 text-lg sm:text-xl text-gray-500 font-medium">
            <span>Subtotal</span>
            <span className="whitespace-nowrap">{fmt(subtotal)}</span>
          </div>
          {order.discount > 0 && (
            <div className="flex justify-between gap-3 text-lg sm:text-xl text-emerald-600 font-bold">
              <span>Discount</span>
              <span className="whitespace-nowrap">-{fmt(order.discount)}</span>
            </div>
          )}
          {tax > 0 && (
            <div className="flex justify-between gap-3 text-lg sm:text-xl text-gray-500 font-medium">
              <span>Tax</span>
              <span className="whitespace-nowrap">{fmt(tax)}</span>
            </div>
          )}
          <div className="flex flex-wrap justify-between items-baseline gap-x-3 text-3xl sm:text-5xl lg:text-4xl xl:text-5xl font-black text-gray-900 pt-2 sm:pt-4">
            <span>TOTAL</span>
            <span className="whitespace-nowrap">{fmt(total)}</span>
          </div>
        </div>
      </div>
      <style>{`.custom-scroll::-webkit-scrollbar{width:6px}.custom-scroll::-webkit-scrollbar-thumb{background:#E5E7EB;border-radius:10px}`}</style>
    </div>
  );
}
