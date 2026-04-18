/**
 * PaymentModal
 * Extracted from TablesView so it can be reused independently.
 * Handles cash / card / QR / split payment flows + receipt printing.
 */
import { useState, useMemo } from 'react';
import {
  X, Clock, CheckCircle, CreditCard, Banknote, QrCode,
  SplitSquareHorizontal, Plus, Minus,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { CURRENCY, fmt, orderTotal } from '../../../lib/currency';
import { loadBillFormatSettings } from '../../../lib/billFormat';

// ── Types ─────────────────────────────────────────────────────────────────────
type SimpleMethod = 'cash' | 'card' | 'qr';
type PaymentMode  = SimpleMethod | 'mix';
interface SplitEntry { method: SimpleMethod; amount: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────
export function calcOrderTotals(order: any) {
  if (!order) return { subtotal: 0, tax: 0, discount: 0, total: 0 };
  const total = orderTotal(order);
  const items: any[] = order?.items ?? order?.order_items ?? [];
  const subtotal = items.reduce((s, i) => s + Number(i.price ?? i.unit_price ?? 0) * Number(i.quantity ?? i.qty ?? 1), 0);
  const tax = Number(order?.tax ?? order?.tax_amount ?? 0);
  const discount = Number(order?.discount ?? order?.discount_amount ?? 0);
  return { subtotal: subtotal > 0 ? subtotal : Number(order?.subtotal ?? 0), tax, discount, total };
}

export function getOrderType(order: any) {
  return order?.order_type ?? order?.orderType ?? 'dine-in';
}

function escapeHtml(v: string) {
  return v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

export function printReceipt(order: any, paymentSummary: string, billNo: string) {
  const settings = loadBillFormatSettings();
  const totals = calcOrderTotals(order);
  const items = order?.items ?? order?.order_items ?? [];

  const rows = items.map((item: any) => {
    const name   = escapeHtml(item.productName || item.product_name || 'Item');
    const price  = Number(item.price ?? item.unit_price ?? 0).toFixed(2);
    const qty    = Number(item.quantity ?? item.qty ?? 1);
    const amount = Number(item.subtotal ?? (item.price ?? 0) * qty).toFixed(2);
    return `<div class="item-block"><div class="item-name">${name}</div><div class="item-row"><span></span><span class="right">${price}</span><span class="right">${qty}</span><span class="right">0.00</span><span class="right">${amount}</span></div></div>`;
  }).join('');

  const win = window.open('', '', 'width=420,height=900');
  if (!win) { toast.error('Please allow pop-ups to print receipts'); return; }

  win.document.write(`<html><head><title>Receipt ${billNo}</title><style>
    body{margin:0;background:#fff;font-family:"Courier New",monospace;}
    .receipt{width:290px;margin:0 auto;padding:24px 20px;color:#3f3a33;}
    .center{text-align:center;}.logo{width:58px;height:58px;border:3px solid #7b7368;border-radius:999px;margin:0 auto 10px;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;}
    .tagline{font-family:Georgia,serif;font-style:italic;font-size:20px;}.restaurant{margin-top:8px;font-size:15px;font-weight:700;text-transform:uppercase;}
    .table-note{margin-top:12px;font-size:13px;}.table-no{font-size:34px;font-weight:700;line-height:1;}
    .divider{border-top:1px dashed #bcb6aa;margin:14px 0;}.meta{font-size:11px;line-height:1.5;}
    .meta-row{display:flex;justify-content:space-between;gap:12px;}
    .header-row,.item-row,.total-row{display:grid;grid-template-columns:1.6fr .7fr .45fr .75fr .8fr;gap:8px;}
    .header-row{font-size:10px;font-weight:700;text-transform:uppercase;}
    .item-block{margin-top:10px;font-size:11px;}.item-name{font-weight:700;line-height:1.3;margin-bottom:2px;}
    .right{text-align:right;}.totals{font-size:11px;line-height:1.8;}
    .totals-line{display:flex;justify-content:space-between;gap:12px;}
    .grand-total{font-size:14px;font-weight:700;margin-top:4px;}
    .thanks{text-align:center;margin-top:14px;font-size:12px;font-weight:700;}
    .footer{text-align:center;margin-top:14px;font-size:10px;text-transform:uppercase;}
    .payment{margin-top:8px;font-size:10px;text-align:center;}
    @media print{body{margin:0;}.receipt{width:auto;}}
  </style></head><body onload="window.print();window.close();">
    <div class="receipt">
      <div class="center">
        ${settings.logoUrl ? `<img src="${escapeHtml(settings.logoUrl)}" style="width:58px;height:58px;border-radius:999px;border:3px solid #7b7368;object-fit:cover;margin:0 auto 10px;display:block;" />` : `<div class="logo">S</div>`}
        <div class="tagline">${escapeHtml(settings.branchTagline)}</div>
        <div class="restaurant">${escapeHtml(settings.restaurantName)}</div>
        <div class="table-note">${getOrderType(order) === 'takeaway' ? 'Takeaway Order' : escapeHtml(settings.headerNote)}</div>
        <div class="table-no">${getOrderType(order) === 'takeaway' ? escapeHtml(`#${order.billNumber || '—'}`) : escapeHtml(String(order.tableNumber || '-'))}</div>
      </div>
      <div class="divider"></div>
      <div class="meta"><div>${escapeHtml(settings.cashierLabel)}</div><div class="meta-row"><span>${escapeHtml(settings.registerLabel)}</span><span>Bill No: ${escapeHtml(billNo)}</span></div></div>
      <div class="divider"></div>
      <div class="header-row"><span>Item</span><span class="right">Price</span><span class="right">Qty</span><span class="right">Disc</span><span class="right">Amt</span></div>
      ${rows}
      <div class="divider"></div>
      <div class="totals">
        <div class="totals-line"><span>${escapeHtml(settings.subtotalLabel)}</span><span>${CURRENCY} ${totals.subtotal.toFixed(2)}</span></div>
        <div class="totals-line"><span>${escapeHtml(settings.discountLabel)}</span><span>${CURRENCY} ${totals.discount.toFixed(2)}</span></div>
        <div class="totals-line"><span>${escapeHtml(settings.taxLabel)}</span><span>${CURRENCY} ${totals.tax.toFixed(2)}</span></div>
        <div class="totals-line grand-total"><span>${escapeHtml(settings.totalLabel)}</span><span>${CURRENCY} ${totals.total.toFixed(2)}</span></div>
      </div>
      <div class="payment">Payment: ${escapeHtml(paymentSummary)}</div>
      <div class="divider"></div>
      <div class="thanks">${escapeHtml(settings.thankYouMessage)}</div>
      <div class="footer">${escapeHtml(settings.footerNote)}</div>
    </div>
  </body></html>`);
  win.document.close();
}

// ── CashChangeRow ─────────────────────────────────────────────────────────────
function CashChangeRow({ total }: { total: number }) {
  const [received, setReceived] = useState('');
  const change = Math.max(0, (parseFloat(received) || 0) - total);
  return (
    <div className="flex items-center gap-3 bg-emerald-50 rounded-xl p-3 border border-emerald-100">
      <div className="flex-1">
        <p className="text-xs text-emerald-700 mb-1 font-medium">Cash received</p>
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">{CURRENCY}</span>
          <input type="number" min={total} step="0.50" placeholder={total.toFixed(2)} value={received}
            onChange={e => setReceived(e.target.value)}
            className="w-full pl-9 pr-2 py-2 text-sm border border-emerald-200 rounded-lg bg-white focus:outline-none focus:border-emerald-400" />
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

// ── Item status badge colours ─────────────────────────────────────────────────
const itemStatusColors: Record<string, string> = {
  pending:   'bg-gray-100 text-gray-600',
  preparing: 'bg-amber-100 text-amber-700',
  ready:     'bg-emerald-100 text-emerald-700',
  served:    'bg-blue-100 text-blue-700',
};

// ── PaymentModal ──────────────────────────────────────────────────────────────
interface PaymentModalProps {
  order: any;
  currentUser: any;
  onClose: () => void;
  onPaid: (orderId: string, billNo: string, paymentSummary: string) => void;
}

export function PaymentModal({ order, currentUser, onClose, onPaid }: PaymentModalProps) {
  const [paymentMode, setPaymentMode]   = useState<PaymentMode | null>(null);
  const [processing, setProcessing]     = useState(false);
  const [showPrint, setShowPrint]       = useState(false);
  const [lastBillNo, setLastBillNo]     = useState('');
  const [lastSummary, setLastSummary]   = useState('');
  const [splits, setSplits]             = useState<SplitEntry[]>([
    { method: 'cash', amount: '' }, { method: 'card', amount: '' },
  ]);

  const totals     = useMemo(() => calcOrderTotals(order), [order]);
  const splitTotal = splits.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
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

  const methodBtn = (mode: PaymentMode, active: string) =>
    `flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all
    ${paymentMode === mode ? `${active} shadow-sm` : 'border-gray-200 hover:border-gray-300 text-gray-700'}`;

  const handlePayment = async () => {
    if (!order || !paymentMode) return;
    if (order.status === 'completed') { toast.error('This bill has already been paid'); return; }
    if (paymentMode === 'mix' && !splitExact) { toast.error(`Split must total exactly ${fmt(totals.total)}`); return; }

    setProcessing(true);
    try {
      const { data: lastBill } = await supabase
        .from('orders').select('bill_number')
        .eq('branch_id', currentUser.branchId)
        .eq('order_type', getOrderType(order))
        .not('bill_number', 'is', null)
        .order('bill_number', { ascending: false })
        .limit(1).maybeSingle();

      const billNo  = String((lastBill?.bill_number ? parseInt(lastBill.bill_number, 10) : 0) + 1).padStart(4, '0');
      const summary = paymentMode === 'mix'
        ? splits.map(s => `${s.method.toUpperCase()} ${fmt(parseFloat(s.amount))}`).join(' + ')
        : paymentMode.toUpperCase();

      const { error: orderErr } = await supabase.from('orders').update({
        status: 'completed', completed_at: new Date().toISOString(),
        payment_method: summary, bill_number: billNo, payment_status: 'paid',
      }).eq('id', order.id).eq('branch_id', currentUser.branchId);

      if (orderErr) throw orderErr;

      if (order.tableId) {
        await supabase.from('tables')
          .update({ status: 'available', current_order_id: null })
          .eq('id', order.tableId).eq('branch_id', currentUser.branchId);
      }

      setLastBillNo(billNo);
      setLastSummary(summary);
      toast.success(`Payment of ${fmt(totals.total)} processed via ${summary}`);
      onPaid(order.id, billNo, summary);
      setShowPrint(true);
    } catch (err: any) {
      toast.error('Payment failed: ' + (err.message || 'Please try again'));
    } finally {
      setProcessing(false);
    }
  };

  // ── Print prompt ─────────────────────────────────────────────────────────
  if (showPrint) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <div><h2 className="font-bold text-lg">Payment Completed</h2><p className="text-xs text-gray-400 mt-0.5">Bill #{lastBillNo}</p></div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100"><X className="size-5" /></button>
          </div>
          <div className="px-6 py-8 text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
              <CheckCircle className="size-8 text-emerald-600" />
            </div>
            <div><p className="text-lg font-semibold text-gray-900">Payment Successful!</p><p className="text-sm text-gray-500 mt-1">Would you like to print a receipt?</p></div>
          </div>
          <div className="px-6 py-4 border-t space-y-3">
            <button onClick={() => { printReceipt({ ...order, billNumber: lastBillNo }, lastSummary, lastBillNo); onClose(); }}
              className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              Print Receipt
            </button>
            <button onClick={onClose} className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors">Skip Printing</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Payment modal ─────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">

        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="font-bold text-lg">{getOrderType(order) === 'takeaway' ? 'Takeaway Order' : `Table ${order.tableNumber}`}</h2>
            <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
              <Clock className="size-3" />
              {order.billNumber ? `Bill #${order.billNumber} • ` : ''}
              {order.createdAt ? new Date(order.createdAt).toLocaleTimeString() : '—'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100"><X className="size-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {(order.items ?? []).length === 0 ? (
            <p className="text-center text-gray-400 py-8">No items in this order</p>
          ) : (order.items ?? []).map((item: any) => (
            <div key={item.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.productName || item.product_name}</p>
                <p className="text-xs text-gray-400">by {item.addedByName || item.added_by_name}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${itemStatusColors[item.status] ?? 'bg-gray-100 text-gray-600'}`}>{item.status}</span>
                <span className="text-xs text-gray-500 w-6 text-center">×{item.quantity}</span>
                <span className="text-sm font-semibold w-24 text-right">{fmt((item.price ?? 0) * (item.quantity ?? 1))}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-3 border-t bg-gray-50 space-y-1">
          <div className="flex justify-between text-sm text-gray-500"><span>Subtotal</span><span>{fmt(totals.subtotal)}</span></div>
          {totals.tax > 0 && <div className="flex justify-between text-sm text-gray-500"><span>Tax</span><span>{fmt(totals.tax)}</span></div>}
          {totals.discount > 0 && <div className="flex justify-between text-sm text-emerald-600"><span>Discount</span><span>−{fmt(totals.discount)}</span></div>}
          <div className="flex justify-between text-lg font-bold pt-2 border-t"><span>Total</span><span>{fmt(totals.total)}</span></div>
        </div>

        {(currentUser.role === 'cashier' || currentUser.role === 'admin') && order.status !== 'completed' && (
          <div className="px-6 py-4 border-t space-y-3">
            <p className="text-sm font-semibold text-gray-700">Payment Method</p>
            <div className="grid grid-cols-4 gap-2">
              <button onClick={() => setPaymentMode('cash')} className={methodBtn('cash', 'border-emerald-500 bg-emerald-50 text-emerald-700')}><Banknote className="size-4" />Cash</button>
              <button onClick={() => setPaymentMode('card')} className={methodBtn('card', 'border-blue-500 bg-blue-50 text-blue-700')}><CreditCard className="size-4" />Card</button>
              <button onClick={() => setPaymentMode('qr')} className={methodBtn('qr', 'border-violet-500 bg-violet-50 text-violet-700')}><QrCode className="size-4" />QR</button>
              <button onClick={() => setPaymentMode('mix')} className={methodBtn('mix', 'border-orange-500 bg-orange-50 text-orange-700')}><SplitSquareHorizontal className="size-4" />Mix</button>
            </div>

            {paymentMode === 'cash' && <CashChangeRow total={totals.total} />}

            {paymentMode === 'mix' && (
              <div className="space-y-2 bg-orange-50 rounded-xl p-3 border border-orange-100">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium text-orange-800">Split Payment</span>
                  <span className={`font-semibold ${splitExact ? 'text-emerald-600' : splitRemain > 0 ? 'text-amber-600' : 'text-red-500'}`}>
                    {splitExact ? '✓ Balanced' : splitRemain > 0 ? `${fmt(splitRemain)} remaining` : `${fmt(splitTotal - totals.total)} over`}
                  </span>
                </div>
                {splits.map((entry, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select value={entry.method} onChange={e => updateSplit(idx, 'method', e.target.value as SimpleMethod)}
                      className="flex-none w-24 text-xs border border-orange-200 rounded-lg px-2 py-2 bg-white focus:outline-none" disabled={processing}>
                      {(['cash','card','qr'] as SimpleMethod[]).map(m => (
                        <option key={m} value={m} disabled={splits.some((s,i) => i !== idx && s.method === m)}>
                          {m === 'cash' ? '💵 Cash' : m === 'card' ? '💳 Card' : '📱 QR'}
                        </option>
                      ))}
                    </select>
                    <div className="flex-1 relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">{CURRENCY}</span>
                      <input type="number" min="0" step="0.01" placeholder="0.00" value={entry.amount}
                        onChange={e => updateSplit(idx, 'amount', e.target.value)}
                        className="w-full pl-9 pr-2 py-2 text-sm border border-orange-200 rounded-lg bg-white focus:outline-none" disabled={processing} />
                    </div>
                    <button onClick={() => updateSplit(idx, 'amount', splitRemain > 0 ? splitRemain.toFixed(2) : entry.amount)}
                      className="text-xs px-2 py-2 bg-white border border-orange-200 hover:bg-orange-100 rounded-lg text-orange-700" disabled={processing}>Fill</button>
                    {splits.length > 2 && (
                      <button onClick={() => setSplits(p => p.filter((_,i) => i !== idx))}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50" disabled={processing}>
                        <Minus className="size-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {splits.length < 3 && (
                  <button onClick={addSplitRow} className="flex items-center gap-1.5 text-xs text-orange-600 hover:text-orange-800 py-1" disabled={processing}>
                    <Plus className="size-3.5" /> Add payment method
                  </button>
                )}
              </div>
            )}

            <button onClick={handlePayment}
              disabled={!paymentMode || processing || (paymentMode === 'mix' && !splitExact)}
              className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
              <CheckCircle className="size-4" />
              {processing ? 'Processing…' : `Confirm Payment — ${fmt(totals.total)}`}
            </button>
          </div>
        )}

        {order.status === 'completed' && (
          <div className="px-6 py-4 border-t bg-emerald-50">
            <div className="flex items-center justify-center gap-2 text-emerald-700 font-medium">
              <CheckCircle className="size-4" />
              <span>Bill already paid via {order.paymentMethod}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
