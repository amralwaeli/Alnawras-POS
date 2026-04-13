import { useState } from 'react';
import { usePOS } from '../context/POSContext';
import { useNavigate } from 'react-router';
import { supabase } from '../../lib/supabase';
import { UtensilsCrossed, Users, DollarSign, X, Clock, CheckCircle, CreditCard, Banknote } from 'lucide-react';
import { toast } from 'sonner';

const statusConfig = {
  available: { label: 'Available', dot: 'bg-emerald-500', card: 'border-gray-100 bg-white hover:border-emerald-200', badge: 'bg-emerald-50 text-emerald-700' },
  occupied:  { label: 'Occupied',  dot: 'bg-blue-500',    card: 'border-blue-200 bg-blue-50/40 hover:border-blue-300', badge: 'bg-blue-50 text-blue-700' },
  reserved:  { label: 'Reserved',  dot: 'bg-amber-500',   card: 'border-amber-200 bg-amber-50/40', badge: 'bg-amber-50 text-amber-700' },
};

const itemStatusColors: Record<string, string> = {
  pending:   'bg-gray-100 text-gray-600',
  preparing: 'bg-amber-100 text-amber-700',
  ready:     'bg-emerald-100 text-emerald-700',
  served:    'bg-blue-100 text-blue-700',
};

export function TablesView() {
  const { tables, orders, currentUser, setOrders, setTables } = usePOS();
  const navigate = useNavigate();
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | null>(null);
  const [processing, setProcessing] = useState(false);

  if (!currentUser) return null;

  const getOrder = (tableId: string) => {
    const t = tables.find(t => t.id === tableId);
    if (!t?.currentOrderId) return null;
    return orders.find(o => o.id === t.currentOrderId) ?? null;
  };

  const available = tables.filter(t => t.status === 'available').length;
  const occupied  = tables.filter(t => t.status === 'occupied').length;

  const openOrderModal = (tableId: string) => {
    const order = getOrder(tableId);
    if (order) setSelectedOrder({ ...order, tableId });
  };

  const handlePayment = async () => {
    if (!selectedOrder || !paymentMethod) return;
    setProcessing(true);
    try {
      const now = new Date().toISOString();
      await supabase.from('orders').update({ status: 'completed', completed_at: now }).eq('id', selectedOrder.id);
      await supabase.from('tables').update({ status: 'available', current_order_id: null }).eq('id', selectedOrder.tableId);
      setOrders(prev => prev.map(o => o.id === selectedOrder.id ? { ...o, status: 'completed' } : o));
      setTables(prev => prev.map(t => t.id === selectedOrder.tableId ? { ...t, status: 'available', currentOrderId: undefined } : t));
      toast.success(`Payment of SAR ${(selectedOrder.total ?? 0).toFixed(2)} processed via ${paymentMethod}`);
      setSelectedOrder(null);
      setPaymentMethod(null);
    } catch {
      toast.error('Payment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-6 space-y-6 max-w-7xl">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tables</h1>
            <p className="text-gray-500 text-sm mt-0.5">Live table status — updates in real time</p>
          </div>
          <div className="flex gap-3">
            <div className="text-center bg-white rounded-xl px-5 py-3 border border-gray-100 shadow-sm">
              <p className="text-2xl font-bold text-emerald-600">{available}</p>
              <p className="text-xs text-gray-400">Available</p>
            </div>
            <div className="text-center bg-white rounded-xl px-5 py-3 border border-gray-100 shadow-sm">
              <p className="text-2xl font-bold text-blue-600">{occupied}</p>
              <p className="text-xs text-gray-400">Occupied</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {tables.map(table => {
            const order = getOrder(table.id);
            const cfg = statusConfig[table.status];
            const pendingItems = order?.items?.filter((i: any) => i.status === 'pending').length ?? 0;

            return (
              <div key={table.id} className={`rounded-2xl border-2 p-4 cursor-pointer transition-all shadow-sm ${cfg.card}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="size-10 bg-gray-100 rounded-xl flex items-center justify-center">
                    <UtensilsCrossed className="size-5 text-gray-600" />
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${cfg.badge}`}>
                      <span className={`size-1.5 rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </span>
                    {pendingItems > 0 && (
                      <span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold animate-pulse">
                        {pendingItems} new
                      </span>
                    )}
                  </div>
                </div>

                <p className="font-bold text-gray-900 text-lg">Table {table.number}</p>
                <p className="text-xs text-gray-400 mb-3 flex items-center gap-1">
                  <Users className="size-3" /> {table.capacity} seats
                </p>

                {order ? (
                  <div className="space-y-2">
                    <div className="bg-white/80 rounded-xl p-2.5 space-y-1.5 border border-black/5">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Items</span>
                        <span className="font-medium">{order.items?.length ?? 0}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500 flex items-center gap-1"><DollarSign className="size-3" />Total</span>
                        <span className="font-bold text-gray-900">SAR {(order.total ?? 0).toFixed(2)}</span>
                      </div>
                    </div>
                    {(currentUser.role === 'cashier' || currentUser.role === 'admin') && (
                      <button onClick={() => openOrderModal(table.id)} className="w-full py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 transition-colors">
                        Process Payment
                      </button>
                    )}
                    {currentUser.role === 'waiter' && (
                      <button onClick={() => navigate(`/table/${table.id}`)} className="w-full py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-colors">
                        Add Items
                      </button>
                    )}
                    {currentUser.role === 'admin' && (
                      <button onClick={() => navigate(`/table/${table.id}`)} className="w-full py-2 bg-gray-700 text-white rounded-xl text-xs font-semibold hover:bg-gray-800 transition-colors">
                        View Menu
                      </button>
                    )}
                  </div>
                ) : (
                  (currentUser.role === 'waiter' || currentUser.role === 'admin') && (
                    <button onClick={() => navigate(`/table/${table.id}`)} className="w-full py-2 bg-gray-900 text-white rounded-xl text-xs font-semibold hover:bg-gray-800 transition-colors mt-1">
                      Start Order
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>

        {tables.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
            <UtensilsCrossed className="size-12 opacity-30" />
            <p className="text-sm">No tables found — add tables in Manage Tables</p>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="font-bold text-lg">Table {selectedOrder.tableNumber}</h2>
                <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                  <Clock className="size-3" />
                  {new Date(selectedOrder.createdAt).toLocaleTimeString()}
                </p>
              </div>
              <button onClick={() => { setSelectedOrder(null); setPaymentMethod(null); }} className="p-2 rounded-xl hover:bg-gray-100">
                <X className="size-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
              {(selectedOrder.items ?? []).length === 0 ? (
                <p className="text-center text-gray-400 py-8">No items</p>
              ) : (
                (selectedOrder.items ?? []).map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.productName || item.product_name}</p>
                      <p className="text-xs text-gray-400">by {item.addedByName || item.added_by_name}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${itemStatusColors[item.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {item.status}
                      </span>
                      <span className="text-xs text-gray-500 w-6 text-center">×{item.quantity}</span>
                      <span className="text-sm font-semibold w-20 text-right">
                        SAR {((item.price ?? 0) * (item.quantity ?? 1)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="px-6 py-4 border-t bg-gray-50 space-y-1.5">
              <div className="flex justify-between text-sm text-gray-500"><span>Subtotal</span><span>SAR {(selectedOrder.subtotal ?? 0).toFixed(2)}</span></div>
              {(selectedOrder.tax ?? 0) > 0 && <div className="flex justify-between text-sm text-gray-500"><span>Tax</span><span>SAR {(selectedOrder.tax ?? 0).toFixed(2)}</span></div>}
              {(selectedOrder.discount ?? 0) > 0 && <div className="flex justify-between text-sm text-emerald-600"><span>Discount</span><span>-SAR {(selectedOrder.discount ?? 0).toFixed(2)}</span></div>}
              <div className="flex justify-between text-lg font-bold pt-2 border-t"><span>Total</span><span>SAR {(selectedOrder.total ?? 0).toFixed(2)}</span></div>
            </div>

            {(currentUser.role === 'cashier' || currentUser.role === 'admin') && (
              <div className="px-6 py-4 border-t space-y-3">
                <p className="text-sm font-medium text-gray-700">Payment Method</p>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setPaymentMethod('cash')} className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${paymentMethod === 'cash' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 hover:border-gray-300'}`}>
                    <Banknote className="size-4" /> Cash
                  </button>
                  <button onClick={() => setPaymentMethod('card')} className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${paymentMethod === 'card' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-gray-300'}`}>
                    <CreditCard className="size-4" /> Card
                  </button>
                </div>
                <button onClick={handlePayment} disabled={!paymentMethod || processing} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                  <CheckCircle className="size-4" />
                  {processing ? 'Processing…' : `Confirm Payment — SAR ${(selectedOrder.total ?? 0).toFixed(2)}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
