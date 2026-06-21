/**
 * PaymentModal
 * Extracted from TablesView so it can be reused independently.
 * Handles cash / card / QR / split payment flows + receipt printing.
 */
import { useState, useMemo, useEffect } from 'react';
import {
  X, Clock, CheckCircle, CreditCard, Banknote, QrCode,
  SplitSquareHorizontal, Plus, Minus, Search, UserCheck, Star, Gift,
  ShieldAlert
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { CURRENCY, fmt, orderTotal } from '../../../lib/currency';
import { loadBillFormatSettings } from '../../../lib/billFormat';
import { LoyaltyController } from '../../controllers/LoyaltyController';
import { loadLoyaltySettings } from '../../models/types';
import type { Customer } from '../../models/types';
import { DeviceService } from '../../services/DeviceService';
import { PrintService } from '../../services/PrintService';

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
    const mods = Array.isArray(item.modifiers) && item.modifiers.length
      ? `<div class="item-name" style="font-size:11px;color:#777;">${escapeHtml(item.modifiers.map((m: any) => m.optionName || m.option_name || '').join(', '))}</div>`
      : '';
    return `<div class="item-block"><div class="item-name">${name}</div>${mods}<div class="item-row"><span></span><span class="right">${price}</span><span class="right">${qty}</span><span class="right">0.00</span><span class="right">${amount}</span></div></div>`;
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

// ── CustomerPanel ─────────────────────────────────────────────────────────────
interface CustomerPanelProps {
  branchId: string;
  loyaltyDiscount: number;
  onCustomerChange: (c: Customer | null) => void;
  onRedemptionChange: (discount: number, points: number) => void;
  linkedCustomer: Customer | null;
}

function CustomerPanel({ branchId, loyaltyDiscount, onCustomerChange, onRedemptionChange, linkedCustomer }: CustomerPanelProps) {
  const [phone, setPhone] = useState('');
  const [searching, setSearching] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [newName, setNewName] = useState('');
  const settings = loadLoyaltySettings();

  const search = async () => {
    if (!phone.trim()) return;
    setSearching(true);
    const res = await LoyaltyController.findByPhone(phone.trim(), branchId);
    setSearching(false);
    if (!res.success) { toast.error('Lookup failed'); return; }
    if (res.customer) {
      onCustomerChange(res.customer);
      setAddMode(false);
    } else {
      toast.info('Customer not found — add them?');
      setAddMode(true);
    }
  };

  const addNew = async () => {
    if (!newName.trim() || !phone.trim()) return;
    setSearching(true);
    const res = await LoyaltyController.createCustomer({ name: newName.trim(), phone: phone.trim(), branchId });
    setSearching(false);
    if (!res.success) { toast.error(res.error || 'Failed to add'); return; }
    onCustomerChange(res.customer!);
    setAddMode(false);
    toast.success('Customer added to loyalty program');
  };

  const unlink = () => {
    onCustomerChange(null);
    onRedemptionChange(0, 0);
    setPhone('');
    setAddMode(false);
    setNewName('');
  };

  const maxPoints = linkedCustomer ? Math.min(linkedCustomer.pointsBalance, Math.floor(linkedCustomer.pointsBalance / settings.minimumRedemption) * settings.minimumRedemption) : 0;
  const canRedeem = linkedCustomer && linkedCustomer.pointsBalance >= settings.minimumRedemption;

  if (!settings.enabled) return null;

  return (
    <div className="border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border-b border-amber-100">
        <Star className="size-3.5 text-amber-500 shrink-0" />
        <p className="text-xs font-semibold text-amber-700">Loyalty — {settings.pointsLabel}</p>
      </div>

      {!linkedCustomer ? (
        <div className="p-3 space-y-2">
          {!addMode ? (
            <div className="flex gap-2">
              <input
                type="tel"
                placeholder="Phone number…"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && search()}
                className="flex-1 text-sm border rounded-lg px-3 py-2 focus:outline-none focus:border-amber-400"
              />
              <button
                onClick={search}
                disabled={searching || !phone.trim()}
                className="px-3 py-2 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 disabled:opacity-40 flex items-center gap-1"
              >
                <Search className="size-3.5" />
                {searching ? '…' : 'Find'}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">New customer — enter their name to register:</p>
              <input
                type="text"
                placeholder="Customer name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:border-amber-400"
              />
              <div className="flex gap-2">
                <button onClick={() => setAddMode(false)} className="flex-1 py-2 text-xs text-gray-600 border rounded-lg hover:bg-gray-50">Back</button>
                <button onClick={addNew} disabled={searching || !newName.trim()} className="flex-1 py-2 text-xs bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-40">
                  {searching ? 'Adding…' : 'Add & Link'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="size-4 text-emerald-500" />
              <div>
                <p className="text-sm font-semibold">{linkedCustomer.name}</p>
                <p className="text-xs text-gray-400">{linkedCustomer.phone}</p>
              </div>
            </div>
            <button onClick={unlink} className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded">Unlink</button>
          </div>
          <div className="flex items-center justify-between bg-amber-50 rounded-lg px-3 py-2">
            <div className="flex items-center gap-1.5">
              <Gift className="size-3.5 text-amber-500" />
              <span className="text-sm font-bold text-amber-700">{linkedCustomer.pointsBalance.toLocaleString()}</span>
              <span className="text-xs text-amber-600">{settings.pointsLabel}</span>
            </div>
            {canRedeem && loyaltyDiscount === 0 ? (
              <button
                onClick={() => onRedemptionChange(
                  parseFloat((maxPoints / settings.redemptionRate).toFixed(2)),
                  maxPoints
                )}
                className="text-xs bg-amber-500 text-white px-2.5 py-1 rounded-lg hover:bg-amber-600"
              >
                Redeem All
              </button>
            ) : loyaltyDiscount > 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-emerald-600">−{fmt(loyaltyDiscount)} applied</span>
                <button onClick={() => onRedemptionChange(0, 0)} className="text-xs text-gray-400 hover:text-red-500">✕</button>
              </div>
            ) : (
              <span className="text-xs text-gray-400">Need {settings.minimumRedemption} to redeem</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── CashChangeRow ─────────────────────────────────────────────────────────────
// Controlled by the parent so the entered amount drives both validation and the
// printed receipt (change due). Leaving it blank means "exact cash" (no change).
function CashChangeRow({ total, value, onChange }: { total: number; value: string; onChange: (v: string) => void }) {
  const change = Math.max(0, (parseFloat(value) || 0) - total);
  return (
    <div className="flex items-center gap-3 bg-emerald-50 rounded-xl p-3 border border-emerald-100">
      <div className="flex-1">
        <p className="text-xs text-emerald-700 mb-1 font-medium">Cash received</p>
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">{CURRENCY}</span>
          <input type="number" min={total} step="0.50" placeholder={total.toFixed(2)} value={value}
            onChange={e => onChange(e.target.value)}
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

// ── Main Component ────────────────────────────────────────────────────────────
interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
  onPaid: (orderId: string, billNo: string, method: string) => void;
  currentUser: any;
}

export function PaymentModal({ isOpen, onClose, order, onPaid, currentUser }: PaymentModalProps) {
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [splits, setSplits] = useState<SplitEntry[]>([
    { method: 'cash', amount: '' }
  ]);
  const [processing, setProcessing] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [lastBillNo, setLastBillNo] = useState('');
  const [lastSummary, setLastSummary] = useState('');
  
  const [linkedCustomer, setLinkedCustomer] = useState<Customer | null>(null);
  const [loyaltyDiscount, setLoyaltyDiscount] = useState(0);
  const [loyaltyPointsToRedeem, setLoyaltyPointsToRedeem] = useState(0);
  const [amountReceived, setAmountReceived] = useState('');

  const loyaltySettings = loadLoyaltySettings();

  // Reset the modal to a clean state whenever a new order is opened, so values
  // from a previous bill (cash received, split, loyalty, print prompt) never leak.
  useEffect(() => {
    if (!isOpen) return;
    setPaymentMode('cash');
    setSplits([{ method: 'cash', amount: '' }]);
    setAmountReceived('');
    setShowPrint(false);
    setLinkedCustomer(null);
    setLoyaltyDiscount(0);
    setLoyaltyPointsToRedeem(0);
  }, [order?.id, isOpen]);

  const baseTotals = useMemo(() => calcOrderTotals(order), [order]);
  const totals = useMemo(() => {
    const discount = baseTotals.discount + loyaltyDiscount;
    const total    = Math.max(0, baseTotals.subtotal + baseTotals.tax - discount);
    return { ...baseTotals, discount, total };
  }, [baseTotals, loyaltyDiscount]);
  
  const splitTotal = splits.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  
  const handleRedemptionChange = (discount: number, points: number) => {
    setLoyaltyDiscount(discount);
    setLoyaltyPointsToRedeem(points);
  };

  // ── Customer Monitor Sync ──────────────────────────────────────────────────
  useEffect(() => {
    if (!order || !isOpen) return;
    const channel = supabase.channel('customer-monitor');
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.send({
          type: 'broadcast',
          event: 'update-bill',
          payload: { 
            order: { ...order, discount: baseTotals.discount + loyaltyDiscount },
            paymentQR: paymentMode === 'qr' ? `ALNAWRAS-PAY-${order.id}-${totals.total}` : null
          }
        });
      }
    });
    return () => { supabase.removeChannel(channel); };
  }, [order, isOpen, loyaltyDiscount, paymentMode, totals.total, baseTotals.discount]);

  if (!isOpen) return null;

  // SECURITY: Check if this device is authorized to handle payments
  const isAuthorized = DeviceService.isAuthorized('payment');

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

    // Validate cash received. A blank field means the customer paid the exact
    // amount (no change), so only block when a value is entered that is too low.
    if (paymentMode === 'cash' && amountReceived.trim() !== '') {
      const received = parseFloat(amountReceived);
      if (isNaN(received) || received < totals.total) {
        toast.error(`Insufficient amount. Total is ${fmt(totals.total)}`);
        return;
      }
    }

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

      const orderUpdate: any = {
        status: 'completed', completed_at: new Date().toISOString(),
        payment_method: summary, bill_number: billNo, payment_status: 'paid',
      };
      if (loyaltyDiscount > 0) {
        orderUpdate.discount = baseTotals.discount + loyaltyDiscount;
        orderUpdate.total = totals.total;
      }
      const { error: orderErr } = await supabase.from('orders').update(orderUpdate).eq('id', order.id).eq('branch_id', currentUser.branchId);

      if (orderErr) throw orderErr;

      if (order.tableId) {
        await supabase.from('tables')
          .update({ status: 'available', current_order_id: null })
          .eq('id', order.tableId).eq('branch_id', currentUser.branchId);
      }

      // ── Loyalty: apply discount & earn/redeem points ──────────────────────
      if (linkedCustomer && loyaltySettings.enabled) {
        if (loyaltyPointsToRedeem > 0) {
          await LoyaltyController.redeemPoints({
            customerId: linkedCustomer.id,
            orderId: order.id,
            points: loyaltyPointsToRedeem,
            branchId: currentUser.branchId,
          });
        }
        const pointsEarned = Math.floor(totals.total * loyaltySettings.pointsPerDollar);
        if (pointsEarned > 0) {
          await LoyaltyController.earnPoints({
            customerId: linkedCustomer.id,
            orderId: order.id,
            points: pointsEarned,
            amountSpent: totals.total,
            branchId: currentUser.branchId,
          });
          toast.success(`+${pointsEarned} ${loyaltySettings.pointsLabel} earned for ${linkedCustomer.name}`);
        }
      }

      // ── Dispatch LAN Receipt Printing ──
      try {
        const printersRaw = localStorage.getItem('alnawras_printers');
        if (printersRaw) {
          const printers = JSON.parse(printersRaw);
          const cashierPrinters = printers.filter((p: any) => p.isActive && p.type === 'network' && (p.stations || []).includes('cashier'));
          
          for (const printer of cashierPrinters) {
            const receiptText = `
ALNAWRAS RESTAURANT
--------------------------------
Bill #: ${billNo}
Date: ${new Date().toLocaleString()}
Table: ${order.tableNumber || 'Takeaway'}
Cashier: ${currentUser?.name || 'N/A'}
--------------------------------
${(order.items || []).map((i: any) => {
              const name = String(i.productName || i.product_name || 'Item');
              const qty = Number(i.quantity ?? i.qty ?? 1);
              const lineTotal = Number(i.price ?? i.unit_price ?? 0) * qty;
              const mods = Array.isArray(i.modifiers) && i.modifiers.length
                ? `\n  ${i.modifiers.map((m: any) => m.optionName || m.option_name || '').join(', ')}`
                : '';
              return `${name.padEnd(20)} x${qty} ${fmt(lineTotal).padStart(8)}${mods}`;
            }).join('\n')}
--------------------------------
SUBTOTAL: ${fmt(totals.subtotal).padStart(20)}
TAX:      ${fmt(totals.tax).padStart(20)}
DISCOUNT: ${fmt(totals.discount).padStart(20)}
TOTAL:    ${fmt(totals.total).padStart(20)}
--------------------------------
PAYMENT: ${summary}
${paymentMode === 'cash' && amountReceived.trim() !== '' ? `RECEIVED: ${fmt(parseFloat(amountReceived)).padStart(19)}\nCHANGE:   ${fmt(Math.max(0, parseFloat(amountReceived) - totals.total)).padStart(21)}` : ''}
--------------------------------
   THANK YOU FOR YOUR VISIT!
            `;

            await PrintService.sendToPrinter({
              printerIp: printer.ipAddress,
              printerPort: printer.port || 9100,
              content: receiptText
            });
          }
        }
      } catch (printErr) {
        console.warn('[ReceiptPrint] LAN Printing failed', printErr);
      }

      setLastBillNo(billNo);
      setLastSummary(summary);
      toast.success(`Payment of ${fmt(totals.total)} processed via ${summary}`);
      
      // Notify customer monitor of success
      const channel = supabase.channel('customer-monitor');
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.send({ type: 'broadcast', event: 'payment-success', payload: {} });
        }
      });

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
        {!isAuthorized ? (
          <div className="p-12 text-center">
            <div className="size-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldAlert className="size-8" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Unauthorized Device</h3>
            <p className="text-sm text-gray-500 mb-6">
              Payments can only be processed at the **Cashier Station**. This device is restricted to ordering only.
            </p>
            <button onClick={onClose} className="w-full py-3 bg-gray-100 text-gray-600 rounded-xl font-semibold">
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="font-bold text-lg">{getOrderType(order) === 'takeaway' ? 'Takeaway Order' : getOrderType(order) === 'pickup' ? 'Pickup Order' : `Table ${order.tableNumber}`}</h2>
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
                    {Array.isArray(item.modifiers) && item.modifiers.length > 0 && (
                      <p className="text-xs text-gray-500 truncate">{item.modifiers.map((m: any) => m.optionName || m.option_name).join(', ')}</p>
                    )}
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
              {baseTotals.discount > 0 && <div className="flex justify-between text-sm text-emerald-600"><span>Discount</span><span>−{fmt(baseTotals.discount)}</span></div>}
              {loyaltyDiscount > 0 && <div className="flex justify-between text-sm text-amber-600"><span>⭐ {loyaltySettings.pointsLabel} Redemption</span><span>−{fmt(loyaltyDiscount)}</span></div>}
              <div className="flex justify-between text-lg font-bold pt-2 border-t"><span>Total</span><span>{fmt(totals.total)}</span></div>
            </div>

            {(currentUser.role === 'cashier' || currentUser.role === 'admin') && order.status !== 'completed' && (
              <div className="px-6 py-4 border-t space-y-3">
                <CustomerPanel
                  branchId={currentUser.branchId}
                  linkedCustomer={linkedCustomer}
                  loyaltyDiscount={loyaltyDiscount}
                  onCustomerChange={setLinkedCustomer}
                  onRedemptionChange={handleRedemptionChange}
                />
                <p className="text-sm font-semibold text-gray-700">Payment Method</p>
                <div className="grid grid-cols-4 gap-2">
                  <button onClick={() => setPaymentMode('cash')} className={methodBtn('cash', 'border-emerald-500 bg-emerald-50 text-emerald-700')}><Banknote className="size-4" />Cash</button>
                  <button onClick={() => setPaymentMode('card')} className={methodBtn('card', 'border-blue-500 bg-blue-50 text-blue-700')}><CreditCard className="size-4" />Card</button>
                  <button onClick={() => setPaymentMode('qr')} className={methodBtn('qr', 'border-violet-500 bg-violet-50 text-violet-700')}><QrCode className="size-4" />QR</button>
                  <button onClick={() => setPaymentMode('mix')} className={methodBtn('mix', 'border-orange-500 bg-orange-50 text-orange-700')}><SplitSquareHorizontal className="size-4" />Mix</button>
                </div>

                {paymentMode === 'cash' && <CashChangeRow total={totals.total} value={amountReceived} onChange={setAmountReceived} />}

                {paymentMode === 'qr' && (
                  <div className="bg-violet-50 rounded-xl p-4 border border-violet-100 flex flex-col items-center text-center space-y-3 animate-in fade-in zoom-in duration-300">
                    <div className="bg-white p-2 rounded-lg shadow-sm border border-violet-100">
                      <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`ALNAWRAS-PAY-${order.id}-${totals.total}`)}`} 
                        alt="Payment QR"
                        className="size-32"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-violet-700 uppercase tracking-tight">Scan to Pay</p>
                      <p className="text-[10px] text-violet-600/70">Dynamic QR generated for {fmt(totals.total)}</p>
                    </div>
                  </div>
                )}

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
                            className="w-full pl-9 pr-2 py-2 text-sm border border-orange-200 rounded-lg bg-white focus:outline-none focus:border-orange-400" disabled={processing} />
                        </div>
                        {splits.length > 1 && (
                          <button onClick={() => setSplits(prev => prev.filter((_, i) => i !== idx))} className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors">
                            <Minus className="size-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    {splits.length < 3 && !splitExact && (
                      <button onClick={addSplitRow} className="w-full py-2 border border-dashed border-orange-300 rounded-lg text-orange-600 text-xs font-medium hover:bg-orange-100/50 flex items-center justify-center gap-1.5 transition-colors">
                        <Plus className="size-3.5" /> Add Payment Method
                      </button>
                    )}
                  </div>
                )}

                <button
                  onClick={handlePayment}
                  disabled={processing || (paymentMode === 'mix' && !splitExact)}
                  className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold hover:bg-black transition-all shadow-lg shadow-black/10 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {processing ? (
                    <span className="size-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>Complete Payment • {fmt(totals.total)}</>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
