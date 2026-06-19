import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { CURRENCY, fmt } from '../../../lib/currency';
import { QrCode, CheckCircle, ShoppingCart, User } from 'lucide-react';

export function CustomerMonitorView() {
  const [order, setOrder] = useState<any>(null);
  const [paymentQR, setPaymentQR] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);

  useEffect(() => {
    // Listen for broadcast messages from the cashier window
    const channel = supabase.channel('customer-monitor')
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
  }, []);

  if (!order) {
    return (
      <div className="h-screen bg-[#0B0E14] flex flex-col items-center justify-center text-white p-12 text-center">
        <div className="bg-orange-500/10 p-8 rounded-[60px] mb-8">
          <ShoppingCart className="size-32 text-orange-500 opacity-20" />
        </div>
        <h1 className="text-5xl font-black italic tracking-tighter uppercase mb-4">Welcome to Alnawras</h1>
        <p className="text-xl text-gray-500 max-w-md">Please check your items on this screen before payment.</p>
      </div>
    );
  }

  const subtotal = (order.items || []).reduce((s: number, i: any) => s + (Number(i.price) * Number(i.quantity)), 0);
  const tax = Number(order.tax || 0);
  const total = Math.max(0, subtotal + tax - (Number(order.discount) || 0));

  return (
    <div className="h-screen bg-white flex overflow-hidden">
      {/* Left Side: Order Items */}
      <div className="flex-1 flex flex-col p-12 bg-gray-50">
        <div className="flex items-center gap-4 mb-12">
          <div className="size-16 bg-orange-500 rounded-2xl flex items-center justify-center text-white text-3xl font-black italic">A</div>
          <div>
            <h2 className="text-3xl font-black tracking-tight">YOUR ORDER</h2>
            <p className="text-gray-500 font-medium uppercase tracking-widest text-sm">Table {order.tableNumber || 'Takeaway'}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-6 pr-4 custom-scroll">
          {order.items.map((item: any) => (
            <div key={item.id} className="flex items-center justify-between bg-white p-6 rounded-[32px] shadow-sm border border-gray-100">
              <div className="flex items-center gap-6">
                <div className="size-12 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600 font-bold text-xl">×{item.quantity}</div>
                <span className="text-2xl font-bold text-gray-800">{item.productName}</span>
              </div>
              <span className="text-2xl font-black text-gray-900">{fmt(item.price * item.quantity)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right Side: Payment Info */}
      <div className="w-[450px] bg-white border-l-2 border-gray-100 flex flex-col p-12">
        <div className="flex-1 flex flex-col justify-center text-center space-y-8">
          {paymentQR ? (
            <div className="space-y-6 animate-in fade-in zoom-in duration-500">
              <div className="bg-violet-50 p-8 rounded-[40px] border-2 border-violet-100 inline-block mx-auto">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(paymentQR)}`} 
                  alt="Payment QR"
                  className="size-64"
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

        <div className="mt-auto space-y-4 pt-12 border-t-2 border-dashed border-gray-200">
          <div className="flex justify-between text-xl text-gray-500 font-medium">
            <span>Subtotal</span>
            <span>{fmt(subtotal)}</span>
          </div>
          {order.discount > 0 && (
            <div className="flex justify-between text-xl text-emerald-600 font-bold">
              <span>Discount</span>
              <span>-{fmt(order.discount)}</span>
            </div>
          )}
          {tax > 0 && (
            <div className="flex justify-between text-xl text-gray-500 font-medium">
              <span>Tax</span>
              <span>{fmt(tax)}</span>
            </div>
          )}
          <div className="flex justify-between text-5xl font-black text-gray-900 pt-4">
            <span>TOTAL</span>
            <span>{fmt(total)}</span>
          </div>
        </div>
      </div>
      <style>{`.custom-scroll::-webkit-scrollbar{width:6px}.custom-scroll::-webkit-scrollbar-thumb{background:#E5E7EB;border-radius:10px}`}</style>
    </div>
  );
}
