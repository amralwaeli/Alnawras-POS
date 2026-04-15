import { useState, useMemo } from 'react';
import { usePOS } from '../context/POSContext';
import { useNavigate } from 'react-router';
import { supabase } from '../../lib/supabase';
import { CURRENCY, fmt } from '../../lib/currency';
import {
  UtensilsCrossed, Users, DollarSign, X, Clock, CheckCircle,
  CreditCard, Banknote, QrCode, SplitSquareHorizontal, Plus, Minus,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Constants ────────────────────────────────────────────────────────────────

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

type SimpleMethod = 'cash' | 'card' | 'qr';
type PaymentMode  = SimpleMethod | 'mix';

interface SplitEntry { method: SimpleMethod; amount: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function calcOrderTotals(order: any) {
  const items: any[] = order?.items ?? [];
  const subtotal = items.reduce((s, i) => s + (Number(i.price ?? 0) * Number(i.quantity ?? 1)), 0);
  const tax      = Number(order?.tax ?? 0);
  const discount = Number(order?.discount ?? 0);
  const dbTotal  = Number(order?.total ?? 0);
  const total    = dbTotal > 0 ? dbTotal : Math.max(0, subtotal + tax - discount);
  return { subtotal: subtotal > 0 ? subtotal : Number(order?.subtotal ?? 0), tax, discount, total };
}

// ─── Cash Change Row ──────────────────────────────────────────────────────────
function CashChangeRow({ total, currency }: { total: number; currency: string }) {
  const [received, setReceived] = useState('');
  const change = Math.max(0, (parseFloat(received) || 0) - total);
  return (
    <div className="flex items-center gap-3 bg-emerald-50 rounded-xl p-3 border border-emerald-100">
      <div className="flex-1">
        <p className="text-xs text-emerald-700 mb-1 font-medium">Cash received</p>
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">{currency}</span>
          <input
            type="number"
            min={total}
            step="0.50"
            placeholder={total.toFixed(2)}
            value={received}
            onChange={e => setReceived(e.target.value)}
            className="w-full pl-9 pr-2 py-2 text-sm border border-emerald-200 rounded-lg bg-white focus:outline-none focus:border-emerald-400"
          />
        </div>
      </div>
      {change > 0 && (
        <div className="text-right">
          <p className="text-xs text-emerald-600 font-medium">Change</p>
          <p className="text-lg font-bold text-emerald-700">{fmt(change)}</p>
        </div>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export function TablesView() {
  const { tables, orders, currentUser, setOrders, setTables } = usePOS();
  const navigate = useNavigate();

  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [paymentMode,   setPaymentMode]   = useState<PaymentMode | null>(null);
  const [processing,    setProcessing]    = useState(false);
  const [splits, setSplits] = useState<SplitEntry[]>([
    { method: 'cash', amount: '' },
    { method: 'card', amount: '' },
  ]);

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
    if (order) {
      setSelectedOrder({ ...order, tableId });
      setPaymentMode(null);
      setSplits([{ method: 'cash', amount: '' }, { method: 'card', amount: '' }]);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const totals = useMemo(() => calcOrderTotals(selectedOrder), [selectedOrder]);

  const splitTotal  = splits.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const splitRemain = Math.max(0, totals.total - splitTotal);
  const splitExact  = Math.abs(totals.total - splitTotal) < 0.005;

  const updateSplit = (idx: number, field: keyof SplitEntry, value: string) =>
    setSplits(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));

  const addSplitRow = () => {
    if (splits.length >= 3) return;
    const used = splits.map(s => s.method);
    const next = (['cash', 'card', 'qr'] as SimpleMethod[]).find(m => !used.includes(m));
    if (next) setSplits(prev => [...prev, { method: next, amount: '' }]);
  };

  const removeSplitRow = (idx: number) =>
    setSplits(prev => prev.filter((_, i) => i !== idx));

  const fillRemaining = (idx: number) =>
    updateSplit(idx, 'amount', splitRemain > 0 ? splitRemain.toFixed(2) : splits[idx].amount);

  const handlePayment = async () => {
    if (!selectedOrder || !paymentMode) return;
    if (paymentMode === 'mix') {
      if (!splitExact) {
        toast.error(`Split amounts must total exactly ${fmt(totals.total)}`);
        return;
      }
      for (const s of splits) {
        if (!s.amount || parseFloat(s.amount) <= 0) {
          toast.error('All payment method amounts must be greater than 0');
          return;
        }
      }
    }
    setProcessing(true);
    try {
      const now = new Date().toISOString();
      await supabase.from('orders').update({ status: 'completed', completed_at: now }).eq('id', selectedOrder.id);
      await supabase.from('tables').update({ status: 'available', current_order_id: null }).eq('id', selectedOrder.tableId);
      setOrders(prev => prev.map(o => o.id === selectedOrder.id ? { ...o, status: 'completed' } : o));
      setTables(prev => prev.map(t => t.id === selectedOrder.tableId ? { ...t, status: 'available', currentOrderId: undefined } : t));
      const summary = paymentMode === 'mix'
        ? splits.map(s => `${s.method.toUpperCase()} ${fmt(parseFloat(s.amount))}`).join(' + ')
        : paymentMode.toUpperCase();
      toast.success(`Payment of ${fmt(totals.total)} processed via ${summary}`);
      setSelectedOrder(null);
      setPaymentMode(null);
    } catch {
      toast.error('Payment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const methodBtnClass = (mode: PaymentMode, activeColor: string) =>
    `flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all
    ${paymentMode === mode ? `${activeColor} shadow-sm` : 'border-gray-200 hover:border-gray-300 text-gray-700'}`;

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-6 space-y-6 max-w-7xl">
        {/* Header */}
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

        {/* Table Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {tables.map(table => {
            const order        = getOrder(table.id);
            const cfg          = statusConfig[table.status];
            const pendingItems = order?.items?.filter((i: any) => i.status === 'pending').length ?? 0;
            const { total }    = calcOrderTotals(order);
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
                        <span className="font-bold text-gray-900">{fmt(total)}</span>
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

      {/* ── Payment Modal ──────────────────────────────────────────────────── */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="font-bold text-lg">Table {selectedOrder.tableNumber}</h2>
                <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                  <Clock className="size-3" />
                  {selectedOrder.createdAt ? new Date(selectedOrder.createdAt).toLocaleTimeString() : '—'}
                </p>
              </div>
              <button onClick={() => { setSelectedOrder(null); setPaymentMode(null); }} className="p-2 rounded-xl hover:bg-gray-100">
                <X className="size-5" />
              </button>
            </div>

            {/* Items list */}
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
                      <span className="text-sm font-semibold w-24 text-right">
                        {fmt((item.price ?? 0) * (item.quantity ?? 1))}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Totals */}
            <div className="px-6 py-3 border-t bg-gray-50 space-y-1">
              <div className="flex justify-between text-sm text-gray-500">
                <span>Subtotal</span><span>{fmt(totals.subtotal)}</span>
              </div>
              {totals.tax > 0 && (
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Tax</span><span>{fmt(totals.tax)}</span>
                </div>
              )}
              {totals.discount > 0 && (
                <div className="flex justify-between text-sm text-emerald-600">
                  <span>Discount</span><span>−{fmt(totals.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold pt-2 border-t">
                <span>Total</span><span>{fmt(totals.total)}</span>
              </div>
            </div>

            {/* Payment section */}
            {(currentUser.role === 'cashier' || currentUser.role === 'admin') && (
              <div className="px-6 py-4 border-t space-y-3">
                <p className="text-sm font-semibold text-gray-700">Payment Method</p>

                <div className="grid grid-cols-4 gap-2">
                  <button onClick={() => setPaymentMode('cash')} className={methodBtnClass('cash', 'border-emerald-500 bg-emerald-50 text-emerald-700')}>
                    <Banknote className="size-4" /> Cash
                  </button>
                  <button onClick={() => setPaymentMode('card')} className={methodBtnClass('card', 'border-blue-500 bg-blue-50 text-blue-700')}>
                    <CreditCard className="size-4" /> Card
                  </button>
                  <button onClick={() => setPaymentMode('qr')} className={methodBtnClass('qr', 'border-violet-500 bg-violet-50 text-violet-700')}>
                    <QrCode className="size-4" /> QR
                  </button>
                  <button onClick={() => setPaymentMode('mix')} className={methodBtnClass('mix', 'border-orange-500 bg-orange-50 text-orange-700')}>
                    <SplitSquareHorizontal className="size-4" /> Mix
                  </button>
                </div>

                {/* Cash change calculator */}
                {paymentMode === 'cash' && (
                  <CashChangeRow total={totals.total} currency={CURRENCY} />
                )}

                {/* Split payment */}
                {paymentMode === 'mix' && (
                  <div className="space-y-2 bg-orange-50 rounded-xl p-3 border border-orange-100">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-orange-800">Split Payment</span>
                      <span className={`font-semibold ${splitExact ? 'text-emerald-600' : splitRemain > 0 ? 'text-amber-600' : 'text-red-500'}`}>
                        {splitExact
                          ? '✓ Balanced'
                          : splitRemain > 0
                            ? `${fmt(splitRemain)} remaining`
                            : `${fmt(splitTotal - totals.total)} over`}
                      </span>
                    </div>

                    {splits.map((entry, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <select
                          value={entry.method}
                          onChange={e => updateSplit(idx, 'method', e.target.value as SimpleMethod)}
                          className="flex-none w-24 text-xs border border-orange-200 rounded-lg px-2 py-2 bg-white focus:outline-none"
                        >
                          {(['cash', 'card', 'qr'] as SimpleMethod[]).map(m => (
                            <option key={m} value={m} disabled={splits.some((s, i) => i !== idx && s.method === m)}>
                              {m === 'cash' ? '💵 Cash' : m === 'card' ? '💳 Card' : '📱 QR'}
                            </option>
                          ))}
                        </select>

                        <div className="flex-1 relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">{CURRENCY}</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={entry.amount}
                            onChange={e => updateSplit(idx, 'amount', e.target.value)}
                            className="w-full pl-9 pr-2 py-2 text-sm border border-orange-200 rounded-lg bg-white focus:outline-none focus:border-orange-400"
                          />
                        </div>

                        <button
                          onClick={() => fillRemaining(idx)}
                          title="Fill remaining"
                          className="text-xs px-2 py-2 bg-white border border-orange-200 hover:bg-orange-100 rounded-lg text-orange-700 whitespace-nowrap"
                        >
                          Fill
                        </button>

                        {splits.length > 2 && (
                          <button onClick={() => removeSplitRow(idx)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50">
                            <Minus className="size-3.5" />
                          </button>
                        )}
                      </div>
                    ))}

                    {splits.length < 3 && (
                      <button onClick={addSplitRow} className="flex items-center gap-1.5 text-xs text-orange-600 hover:text-orange-800 py-1">
                        <Plus className="size-3.5" /> Add payment method
                      </button>
                    )}
                  </div>
                )}

                <button
                  onClick={handlePayment}
                  disabled={!paymentMode || processing || (paymentMode === 'mix' && !splitExact)}
                  className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircle className="size-4" />
                  {processing ? 'Processing…' : `Confirm Payment — ${fmt(totals.total)}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}