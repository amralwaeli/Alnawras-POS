/**
 * PaymentModal
 * Extracted from TablesView so it can be reused independently.
 * Handles cash / card / QR / split payment flows + receipt printing.
 */
import { useState, useMemo, useEffect } from 'react';
import {
  X, Clock, CheckCircle, CreditCard, Banknote, QrCode,
  SplitSquareHorizontal, Plus, Minus, Search, UserCheck, Star, Gift,
  ShieldAlert, Users, Check, HandCoins,
  Printer,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { CURRENCY, fmt, orderTotal } from '../../../lib/currency';
import { loadBillFormatSettings } from '../../../lib/billFormat';
import { INVOICE_FROM } from '../../../lib/branding';
import { LoyaltyController } from '../../controllers/LoyaltyController';
import { DebtController, DebtAccount } from '../../controllers/DebtController';
import { cachedPrinters } from '../../controllers/PrinterController';
import type { Customer, DiscountPreset } from '../../models/types';
import { ROLE_PERMISSIONS, permissionsFor } from '../../models/types';
import { DeviceService } from '../../services/DeviceService';
import { PrintService, cleanPrintText, type PrintLine, type ReceiptLine } from '../../services/PrintService';
import { useBranch } from '../../context/BranchContext';
import { computeTax, presetDiscountAmount, splitDue } from '../../../lib/money';
import QRCode from 'qrcode';
import { friendlyError } from '../../../lib/errors';
import { isNativeApp } from '../../../lib/platform';

const NO_RECEIPT_PRINTER = 'No receipt printer set up — add one in Printers (station: Receipts)';

// ── Types ─────────────────────────────────────────────────────────────────────
type SimpleMethod = 'cash' | 'card' | 'qr';
type MixMethod    = SimpleMethod | 'account';   // a customer debt account (migration 0036)
type PaymentMode  = SimpleMethod | 'account' | 'mix' | 'split-items';
interface SplitEntry { method: MixMethod; amount: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────
export function calcOrderTotals(order: any) {
  if (!order) return { subtotal: 0, tax: 0, discount: 0, total: 0 };
  const total = orderTotal(order);
  // Voided (cancelled) items stay on the order for the audit trail but are never charged.
  const items: any[] = (order?.items ?? order?.order_items ?? []).filter((i: any) => i.status !== 'cancelled');
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

/** Receipt lines for the thermal printer. `payment` lines are omitted for a bill printed
 *  before payment (then the header says NOT PAID). */
export function buildReceiptLines(o: {
  businessName: string; billNo: string; order: any; cashier: string;
  totals: { subtotal: number; tax: number; discount: number; total: number };
  payment?: PrintLine[];
}): ReceiptLine[] {
  const when = new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true });
  const where = o.order.orderType === 'takeaway' ? 'Takeaway' : o.order.orderType === 'pickup' ? 'Pickup' : `Table ${cleanPrintText(o.order.tableNumber ?? '')}`;
  const items = (o.order.items || []).filter((i: any) => i.status !== 'cancelled');
  const name = cleanPrintText(o.businessName);
  // Address / phone lines from Business Settings' invoice "From" text (its first line is often the name again).
  const from = INVOICE_FROM.split('\n').map(l => cleanPrintText(l).trim()).filter(Boolean);
  if (from[0]?.toLowerCase() === name.trim().toLowerCase()) from.shift();
  return [
    'logo',
    { text: name.toUpperCase(), style: 'large', align: 'center' },
    ...from.map(text => ({ text, align: 'center' as const })),
    ...(o.payment ? [] : [{ text: 'BILL - NOT PAID', style: 'large' as const, align: 'center' as const }]),
    'rule',
    { text: 'Bill #', value: o.billNo || '-' },
    { text: 'Date', value: when },
    { text: o.order.orderType === 'takeaway' || o.order.orderType === 'pickup' ? 'Order' : 'Table', value: where },
    { text: 'Cashier', value: cleanPrintText(o.cashier || 'N/A') },
    'rule',
    ...items.flatMap((i: any): PrintLine[] => {
      const name = cleanPrintText(i.productName || i.product_name || 'Item');
      const qty = Number(i.quantity ?? i.qty ?? 1);
      const lineTotal = Number(i.price ?? i.unit_price ?? 0) * qty;
      const mods = Array.isArray(i.modifiers) && i.modifiers.length
        ? [{ text: `     + ${i.modifiers.map((m: any) => cleanPrintText(m.optionName || m.option_name || '')).join(', ')}` }]
        : [];
      return [{ text: `${qty} x ${name}`, value: fmt(lineTotal) }, ...mods];
    }),
    'rule',
    { text: 'SUBTOTAL', value: fmt(o.totals.subtotal) },
    { text: 'TAX', value: fmt(o.totals.tax) },
    { text: 'DISCOUNT', value: fmt(o.totals.discount) },
    { text: 'TOTAL', value: fmt(o.totals.total), style: 'large' },
    'rule',
    ...(o.payment ? [...o.payment, 'rule' as const, { text: 'THANK YOU FOR YOUR VISIT!', align: 'center' as const }]
                  : [{ text: 'Please check your order before paying.', align: 'center' as const }]),
  ];
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
  const { settings: branchSettings, businessName } = useBranch();
  const settings = branchSettings.loyalty;

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
    if (!res.success) { toast.error(friendlyError(res.error, 'Failed to add')); return; }
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
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <UserCheck className="size-4 text-emerald-500" />
              <div className="min-w-0">
                <p className="text-sm font-semibold break-words" dir="auto">{linkedCustomer.name}</p>
                <p className="text-xs text-gray-400">{linkedCustomer.phone}</p>
              </div>
            </div>
            <button onClick={unlink} className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded">Unlink</button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-50 rounded-lg px-3 py-2">
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
      <div className="flex-1 min-w-0">
        <p className="text-xs text-emerald-700 mb-1 font-medium">Cash received</p>
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">{CURRENCY}</span>
          <input type="number" min={total} step="0.50" placeholder={total.toFixed(2)} value={value}
            onChange={e => onChange(e.target.value)}
            className="w-full pl-9 pr-2 py-2 text-sm border border-emerald-200 rounded-lg bg-white focus:outline-none focus:border-emerald-400" />
        </div>
      </div>
      {change > 0 && (
        <div className="text-right shrink-0">
          <p className="text-xs text-emerald-600 font-medium">Change</p>
          <p className="text-lg font-bold text-emerald-700 whitespace-nowrap">{fmt(change)}</p>
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
  // Final money breakdown snapshot for the receipt (order prop isn't re-fetched).
  const [lastTotals, setLastTotals] = useState<{ subtotal: number; discount: number; tax: number; total: number } | null>(null);
  // Own copy of the paid order: the parent drops it from the open-orders list while the print prompt is still showing.
  const [receiptOrder, setReceiptOrder] = useState<any>(null);
  const [lanPrinted, setLanPrinted] = useState(false);
  const [lastReceiptLines, setLastReceiptLines] = useState<ReceiptLine[] | null>(null);
  
  const [linkedCustomer, setLinkedCustomer] = useState<Customer | null>(null);
  const [loyaltyDiscount, setLoyaltyDiscount] = useState(0);
  const [loyaltyPointsToRedeem, setLoyaltyPointsToRedeem] = useState(0);
  const [amountReceived, setAmountReceived] = useState('');
  // "On account": the customer pays later (Customer Debts).
  const [debtAccounts, setDebtAccounts] = useState<DebtAccount[] | null>(null);
  const [debtAccountId, setDebtAccountId] = useState<string | null>(null);
  const [debtSearch, setDebtSearch] = useState('');
  const [newDebtName, setNewDebtName] = useState('');
  const [newDebtPhone, setNewDebtPhone] = useState('');
  // Tenant-admin-configured tax + quick-discount presets for this branch.
  const { settings: branchSettings, businessName } = useBranch();
  const [presetDiscount, setPresetDiscount] = useState(0);
  const [appliedPresetId, setAppliedPresetId] = useState<string | null>(null);

  // ── Split-by-item payment state ("everyone pays for what they ate") ──────
  const [splitSelected, setSplitSelected] = useState<Set<string>>(new Set());
  const [splitMethod, setSplitMethod] = useState<SimpleMethod>('cash');
  const [splitAmountReceived, setSplitAmountReceived] = useState('');
  const [paidItemIds, setPaidItemIds] = useState<Set<string>>(new Set());
  const [splitProcessing, setSplitProcessing] = useState(false);
  // One discount % for every guest on the split; editable only before the first item is paid.
  const [splitPctText, setSplitPctText] = useState('');
  const [usedSplitPct, setUsedSplitPct] = useState<number | null>(null);

  const loyaltySettings = branchSettings.loyalty;

  // Reset the modal to a clean state whenever a new order is opened, so values
  // from a previous bill (cash received, split, loyalty, print prompt) never leak.
  useEffect(() => {
    if (!isOpen) return;
    setPaymentMode('cash');
    setSplits([{ method: 'cash', amount: '' }]);
    setAmountReceived('');
    setShowPrint(false);
    setLanPrinted(false);
    setLinkedCustomer(null);
    setLoyaltyDiscount(0);
    setLoyaltyPointsToRedeem(0);
    setSplitSelected(new Set());
    setSplitMethod('cash');
    setSplitAmountReceived('');
    setPaidItemIds(new Set());
    setSplitPctText('');
    setUsedSplitPct(null);
    setPresetDiscount(0);
    setAppliedPresetId(null);
    setDebtAccountId(null);
    setDebtSearch('');
    setDebtAccounts(null);
  }, [order?.id, isOpen]);

  const usesAccount = paymentMode === 'account' || (paymentMode === 'mix' && splits.some(s => s.method === 'account'));
  const loadDebtAccounts = () => DebtController.list(currentUser.branchId).then(res => {
    if (res.success) setDebtAccounts(res.data.filter(a => a.isActive));
    else toast.error(friendlyError(res.error, 'Could not load customer accounts'));
  });
  useEffect(() => { if (isOpen && usesAccount && debtAccounts === null) loadDebtAccounts(); }, [isOpen, usesAccount]);

  const createDebtAccount = async () => {
    if (!newDebtName.trim()) { toast.error('Enter the customer name'); return; }
    const res = await DebtController.save(currentUser.branchId, { name: newDebtName, phone: newDebtPhone, terms: 'flexible' });
    if (!res.success) { toast.error(friendlyError(res.error, 'Could not create the account')); return; }
    setNewDebtName(''); setNewDebtPhone('');
    await loadDebtAccounts();
    setDebtAccountId(res.data.id);
  };

  // Items still owed on this bill — already-paid (via a prior split) or
  // voided items drop out as soon as they're settled.
  const unpaidItems = useMemo(
    () => ((order?.items ?? []) as any[]).filter(i => !paidItemIds.has(i.id) && !i.paid && i.status !== 'cancelled'),
    [order, paidItemIds]
  );
  const splitSelectedTotal = useMemo(
    () => unpaidItems.filter(i => splitSelected.has(i.id)).reduce((s, i) => s + Number(i.price ?? 0) * Number(i.quantity ?? 1), 0),
    [unpaidItems, splitSelected]
  );
  // Once any item is paid (in this window or before), whole-order payment modes
  // are no longer safe — they'd re-charge items another guest already paid for.
  const lockedToSplit = paidItemIds.size > 0 || ((order?.items ?? []) as any[]).some(i => i.paid && i.status !== 'cancelled');
  // The split %: chosen by the cashier until the first payment, then locked to what the server stored.
  const splitPct = lockedToSplit
    ? (usedSplitPct ?? Number(order?.splitDiscountPct ?? 0))
    : Math.min(Math.max(Number(splitPctText) || 0, 0), 100);
  // What the selected guest actually pays — same as pay_order_items: % off first, then exclusive branch tax.
  const { net: splitSelectedNet, due: splitSelectedDue } = useMemo(
    () => splitDue(splitSelectedTotal, splitPct, branchSettings.taxEnabled, branchSettings.taxRate, branchSettings.taxInclusive),
    [splitSelectedTotal, splitPct, branchSettings]
  );
  // What is still owed on the bill (approximate: each guest's share is rounded separately).
  const splitLeftDue = useMemo(
    () => splitDue(unpaidItems.reduce((s, i) => s + Number(i.price ?? 0) * Number(i.quantity ?? 1), 0), splitPct,
      branchSettings.taxEnabled, branchSettings.taxRate, branchSettings.taxInclusive).due,
    [unpaidItems, splitPct, branchSettings]
  );

  const baseTotals = useMemo(() => calcOrderTotals(order), [order]);
  const totals = useMemo(() => {
    const discount = baseTotals.discount + loyaltyDiscount + presetDiscount;
    const net = Math.max(0, baseTotals.subtotal - discount);
    const tax = computeTax(net, branchSettings.taxEnabled, branchSettings.taxRate, branchSettings.taxInclusive);
    // Inclusive tax is already inside the net amount; exclusive tax adds on top.
    const total = branchSettings.taxInclusive ? net : net + tax;
    return { subtotal: baseTotals.subtotal, discount, tax, total };
  }, [baseTotals, loyaltyDiscount, presetDiscount, branchSettings]);

  // Apply / clear a one-tap discount preset (Student 10%, etc.).
  const applyPreset = (preset: DiscountPreset) => {
    if (appliedPresetId === preset.id) { setPresetDiscount(0); setAppliedPresetId(null); return; }
    setPresetDiscount(presetDiscountAmount(baseTotals.subtotal, preset));
    setAppliedPresetId(preset.id);
  };

  // A bill for the customer to check before paying (current items, discount and total).
  const printBill = () => {
    if (!order || !currentUser) return;
    const billNo = order.billNumber ?? '';
    const printers = cachedPrinters(currentUser.branchId)
      .filter((p: any) => p.isActive && p.type === 'network' && (p.stations || []).includes('cashier'));
    if (!printers.length) {
      // In the app window.open would push Chrome over SmartPos.
      if (isNativeApp()) toast.error(NO_RECEIPT_PRINTER);
      else printReceipt({ ...order, ...totals }, 'NOT PAID - please check before paying', billNo);
      return;
    }
    const lines = buildReceiptLines({ businessName, billNo, order, cashier: currentUser.name, totals });
    for (const printer of printers) {
      void PrintService.sendToPrinter({ printerIp: printer.ipAddress!, printerPort: printer.port || 9100, bytes: PrintService.render(lines, printer.paperWidth) })
        .then(res => res.success ? toast.success('Bill printed') : toast.error(`Receipt printer ${printer.name || printer.ipAddress}: ${res.error}`));
    }
  };

  // A one-off discount typed by the cashier (RM amount or %), applied like a preset.
  const [customValue, setCustomValue] = useState('');
  const [customType, setCustomType] = useState<'fixed' | 'percentage'>('fixed');
  const applyCustom = () => {
    const value = Math.min(Number(customValue) || 0, customType === 'percentage' ? 100 : Infinity);
    if (!(value > 0)) { toast.error('Enter a discount above 0'); return; }
    setPresetDiscount(presetDiscountAmount(baseTotals.subtotal, { id: 'custom', label: 'Discount', type: customType, value }));
    setAppliedPresetId('custom');
  };
  
  useEffect(() => {
    if (lockedToSplit && paymentMode !== 'split-items') setPaymentMode('split-items');
  }, [lockedToSplit, paymentMode]);

  // Preset discounts are whole-order only. Clear any applied preset when the
  // cashier switches to split-by-item so the (ignored-by-the-RPC) discount
  // can't silently show in the summary while not affecting what guests pay.
  useEffect(() => {
    if (paymentMode === 'split-items' && (presetDiscount > 0 || appliedPresetId || loyaltyPointsToRedeem > 0)) {
      setPresetDiscount(0);
      setAppliedPresetId(null);
      // Points can't be redeemed in split mode either (they'd be taken with no discount).
      setLoyaltyDiscount(0);
      setLoyaltyPointsToRedeem(0);
    }
  }, [paymentMode, presetDiscount, appliedPresetId, loyaltyPointsToRedeem]);

  const splitTotal = splits.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  
  const handleRedemptionChange = (discount: number, points: number) => {
    setLoyaltyDiscount(discount);
    setLoyaltyPointsToRedeem(points);
  };

  // ── Customer Monitor Sync ──────────────────────────────────────────────────
  useEffect(() => {
    if (!order || !isOpen) return;
    const channel = supabase.channel(DeviceService.customerMonitorChannel(currentUser.branchId));
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.send({
          type: 'broadcast',
          event: 'update-bill',
          payload: {
            order: { ...order, discount: totals.discount, tax: totals.tax, total: totals.total },
            paymentQR: paymentMode === 'qr' ? `SMARTPOS-PAY-${order.id}-${totals.total}` : null
          }
        });
      }
    });
    return () => { supabase.removeChannel(channel); };
  }, [order, isOpen, paymentMode, totals.total, totals.tax, totals.discount]);

  // Drawn locally — the order id and total used to be sent to a third-party QR service.
  const payQrText = order && paymentMode === 'qr' ? `SMARTPOS-PAY-${order.id}-${totals.total}` : null;
  const [payQrImage, setPayQrImage] = useState<string | null>(null);
  useEffect(() => {
    if (!payQrText) { setPayQrImage(null); return; }
    QRCode.toDataURL(payQrText, { width: 150, margin: 1 }).then(setPayQrImage, () => setPayQrImage(null));
  }, [payQrText]);

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
    const next = (['cash', 'card', 'qr', 'account'] as MixMethod[]).find(m => !used.includes(m));
    if (next) setSplits(prev => [...prev, { method: next, amount: '' }]);
  };

  const methodBtn = (mode: PaymentMode, active: string) =>
    `min-w-0 min-h-11 flex flex-wrap items-center justify-center gap-1.5 px-1 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all
    ${paymentMode === mode ? `${active} shadow-sm` : 'border-gray-200 hover:border-gray-300 text-gray-700'}`;

  // Shared tail for any payment path that just completed the WHOLE order:
  // notify the customer-facing monitor, hand back to the parent, and prompt to
  // print. `server` is pay_order's result (whole-bill path): the server already
  // did loyalty and its totals are the real ones. Without it (the last split of
  // a split bill) we only earn points — redemption is not offered in split mode.
  const finalizeCompletedOrder = async (
    billNo: string, summary: string,
    server?: { subtotal: number; discount: number; tax: number; total: number; pointsEarned: number },
  ) => {
    if (server) {
      if (server.pointsEarned > 0 && linkedCustomer) {
        toast.success(`+${server.pointsEarned} ${loyaltySettings.pointsLabel} earned for ${linkedCustomer.name}`);
      }
    } else if (linkedCustomer && loyaltySettings.enabled) {
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

    setLastBillNo(billNo);
    setLastSummary(summary);
    setLastTotals(server
      ? { subtotal: server.subtotal, discount: server.discount, tax: server.tax, total: server.total }
      : { subtotal: totals.subtotal, discount: totals.discount, tax: totals.tax, total: totals.total });
    setReceiptOrder(order);

    // Notify customer monitor of success (one-shot). Remove the channel after
    // sending so a completed payment doesn't leak a realtime subscription
    // every time — hundreds would otherwise accumulate over a shift.
    const successCh = supabase.channel(DeviceService.customerMonitorChannel(currentUser.branchId));
    successCh.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await successCh.send({ type: 'broadcast', event: 'payment-success', payload: {} });
        void supabase.removeChannel(successCh);
      }
    });

    onPaid(order.id, billNo, summary);
    setShowPrint(true);
  };

  const handlePayment = async () => {
    if (!order || !paymentMode) return;
    if (order.status === 'completed') { toast.error('This bill has already been paid'); return; }
    // Defence-in-depth: once part of the bill is paid by item, the whole-order
    // path must not run (it would re-charge already-settled items).
    if (lockedToSplit) { toast.error('This bill is partially paid — continue by item'); return; }
    if (paymentMode === 'mix' && !splitExact) { toast.error(`Split must total exactly ${fmt(totals.total)}`); return; }
    if (usesAccount && !debtAccountId) { toast.error('Choose the customer account'); return; }

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
      // One locked server transaction (migration 0033): refuses a bill that was
      // already paid, computes the totals itself, redeems/earns loyalty, writes
      // the payment rows and frees the table.
      const payments = paymentMode === 'mix'
        ? splits.filter(sp => parseFloat(sp.amount) > 0).map(sp => ({
            method: sp.method, amount: parseFloat(sp.amount),
            ...(sp.method === 'account' ? { account_id: debtAccountId } : {}),
          }))
        : [{ method: paymentMode, ...(paymentMode === 'account' ? { account_id: debtAccountId } : {}) }];
      const useLoyalty = !!linkedCustomer && loyaltySettings.enabled;
      const { data: r, error: payErr } = await supabase.rpc('pay_order', {
        p_order_id: order.id,
        p_branch_id: currentUser.branchId,
        p_payments: payments,
        p_discount: baseTotals.discount + presetDiscount,
        p_cashier_id: currentUser.id,
        p_cashier_name: currentUser.name,
        p_customer_id: useLoyalty ? linkedCustomer!.id : null,
        p_redeem_points: useLoyalty ? loyaltyPointsToRedeem : 0,
      });
      if (payErr) throw payErr;
      const billNo = String(r.bill_number);
      const summary = String(r.payment_summary);
      const paid = {
        subtotal: Number(r.subtotal), discount: Number(r.discount), tax: Number(r.tax),
        total: Number(r.total), pointsEarned: Number(r.points_earned ?? 0),
      };

      // ── Dispatch LAN Receipt Printing ──
      try {
        const printers: any[] = cachedPrinters(currentUser.branchId);
        if (printers.length) {
          const cashierPrinters = printers.filter((p: any) => p.isActive && p.type === 'network' && (p.stations || []).includes('cashier'));

          const receipt = buildReceiptLines({
            businessName, billNo, order, cashier: currentUser?.name || '', totals: paid,
            payment: [
              { text: 'PAYMENT', value: summary },
              ...(paymentMode === 'cash' && amountReceived.trim() !== '' ? [
                { text: 'RECEIVED', value: fmt(parseFloat(amountReceived)) },
                { text: 'CHANGE', value: fmt(Math.max(0, parseFloat(amountReceived) - paid.total)) },
              ] : []),
            ],
          });
          setLastReceiptLines(receipt);

          for (const printer of cashierPrinters) {
            // Not awaited: a switched-off printer must not hold up the till.
            void PrintService.sendToPrinter({
              printerIp: printer.ipAddress,
              printerPort: printer.port || 9100,
              bytes: PrintService.render(receipt, printer.paperWidth),
            }).then(res => {
              if (res.success) setLanPrinted(true);
              else toast.error(`Receipt printer ${printer.name || printer.ipAddress}: ${res.error}`);
            });
          }
        }
      } catch (printErr) {
        console.warn('[ReceiptPrint] LAN Printing failed', printErr);
      }

      toast.success(`Payment of ${fmt(paid.total)} processed via ${summary}`);
      await finalizeCompletedOrder(billNo, summary, paid);
    } catch (err: any) {
      toast.error(friendlyError(err, 'Payment failed. Please try again.'));
    } finally {
      setProcessing(false);
    }
  };

  // ── Split-by-item payment: settle a subset of the bill's items ───────────
  const handleSplitPay = async () => {
    if (splitSelected.size === 0) { toast.error('Select at least one item to pay for'); return; }
    if (splitMethod === 'cash' && splitAmountReceived.trim() !== '') {
      const received = parseFloat(splitAmountReceived);
      if (isNaN(received) || received < splitSelectedDue) {
        toast.error(`Insufficient amount. Due is ${fmt(splitSelectedDue)}`);
        return;
      }
    }

    setSplitProcessing(true);
    try {
      const { data, error } = await supabase.rpc('pay_order_items', {
        p_order_id: order.id,
        p_item_ids: Array.from(splitSelected),
        p_method: splitMethod,
        p_amount_received: splitMethod === 'cash' && splitAmountReceived.trim() !== '' ? parseFloat(splitAmountReceived) : null,
        p_cashier_id: currentUser.id,
        p_cashier_name: currentUser.name,
        p_branch_id: currentUser.branchId,
        // Before the first payment: the chosen %; after it: the locked % (never a different one).
        p_discount_pct: splitPct > 0 ? splitPct : null,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;

      setUsedSplitPct(splitPct);
      setPaidItemIds(prev => new Set([...prev, ...splitSelected]));
      toast.success(`Paid ${fmt(Number(row.amount))} via ${splitMethod.toUpperCase()}`);
      setSplitSelected(new Set());
      setSplitAmountReceived('');

      if (row.order_completed) {
        await finalizeCompletedOrder(row.bill_number, 'Split Payment');
      }
    } catch (err: any) {
      toast.error(friendlyError(err, 'Payment failed. Please try again.'));
    } finally {
      setSplitProcessing(false);
    }
  };

  // "Print again": in the app, re-send the paid receipt to the receipt printer instead of opening a browser page.
  const reprintReceipt = () => {
    if (!isNativeApp()) {
      printReceipt({ ...(receiptOrder ?? order), billNumber: lastBillNo, ...(lastTotals ?? {}) }, lastSummary, lastBillNo);
      return;
    }
    const printers = cachedPrinters(currentUser.branchId)
      .filter((p: any) => p.isActive && p.type === 'network' && (p.stations || []).includes('cashier'));
    if (!printers.length) { toast.error(NO_RECEIPT_PRINTER); return; }
    // A split-by-item payment builds no receipt at payment: build it from the paid bill.
    const lines = lastReceiptLines ?? buildReceiptLines({
      businessName, billNo: lastBillNo, order: receiptOrder ?? order, cashier: currentUser.name,
      totals: lastTotals ?? totals, payment: [{ text: 'PAYMENT', value: lastSummary }],
    });
    for (const printer of printers) {
      void PrintService.sendToPrinter({ printerIp: printer.ipAddress!, printerPort: printer.port || 9100, bytes: PrintService.render(lines, printer.paperWidth) })
        .then(res => res.success ? toast.success('Receipt printed') : toast.error(`Receipt printer ${printer.name || printer.ipAddress}: ${res.error}`));
    }
  };

  // ── Print prompt ─────────────────────────────────────────────────────────
  if (showPrint) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 sm:p-4">
        <div className="bg-white rounded-2xl w-full max-w-md max-h-[calc(100dvh-1rem)] sm:max-h-[90dvh] overflow-y-auto overscroll-contain shadow-2xl">
          <div className="flex items-center justify-between gap-2 px-4 sm:px-6 py-4 border-b">
            <div className="min-w-0"><h2 className="font-bold text-lg">Payment Completed</h2><p className="text-xs text-gray-400 mt-0.5 break-all">Bill #{lastBillNo}</p></div>
            <button onClick={onClose} aria-label="Close" className="p-3 -mr-1 shrink-0 rounded-xl hover:bg-gray-100"><X className="size-5" /></button>
          </div>
          <div className="px-4 sm:px-6 py-6 sm:py-8 text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
              <CheckCircle className="size-8 text-emerald-600" />
            </div>
            <div><p className="text-lg font-semibold text-gray-900">Payment Successful!</p><p className="text-sm text-gray-500 mt-1">{lanPrinted ? 'Receipt sent to the printer.' : 'Would you like to print a receipt?'}</p></div>
          </div>
          <div className="px-4 sm:px-6 py-4 border-t space-y-3">
            <button onClick={() => { reprintReceipt(); onClose(); }}
              className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              {lanPrinted ? 'Print again' : 'Print Receipt'}
            </button>
            <button onClick={onClose} className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors">{lanPrinted ? 'Done' : 'Skip Printing'}</button>
          </div>
        </div>
      </div>
    );
  }

  const canTakePayment = permissionsFor(currentUser)?.canProcessPayments && order.status !== 'completed';

  // ── Payment modal ─────────────────────────────────────────────────────────
  // Header and the Complete Payment button stay put; everything between scrolls,
  // so the button is always reachable on a phone (portrait or landscape).
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[calc(100dvh-1rem)] sm:max-h-[90dvh] flex flex-col overflow-hidden shadow-2xl">
        {!isAuthorized ? (
          <div className="p-6 sm:p-12 text-center overflow-y-auto">
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
            <div className="shrink-0 flex items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4 border-b">
              <div className="min-w-0">
                <h2 className="font-bold text-lg truncate">{getOrderType(order) === 'takeaway' ? 'Takeaway Order' : getOrderType(order) === 'pickup' ? 'Pickup Order' : `Table ${order.tableNumber}`}</h2>
                <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                  <Clock className="size-3" />
                  {order.billNumber ? `Bill #${order.billNumber} • ` : ''}
                  {order.createdAt ? new Date(order.createdAt).toLocaleTimeString() : '—'}
                </p>
              </div>
              <button onClick={onClose} aria-label="Close" className="p-3 -mr-1 shrink-0 rounded-xl hover:bg-gray-100"><X className="size-5" /></button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div className="px-4 sm:px-6 py-4 space-y-2">
              {(order.items ?? []).length === 0 ? (
                <p className="text-center text-gray-400 py-8">No items in this order</p>
              ) : (order.items ?? []).map((item: any) => {
                const isPaid = item.status !== 'cancelled' && (item.paid || paidItemIds.has(item.id));
                return (
                <div key={item.id} className={`flex items-center justify-between gap-2 py-2.5 border-b border-gray-50 last:border-0 ${isPaid || item.status === 'cancelled' ? 'opacity-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" dir="auto">{item.productName || item.product_name}</p>
                    {Array.isArray(item.modifiers) && item.modifiers.length > 0 && (
                      <p className="text-xs text-gray-500 truncate" dir="auto">{item.modifiers.map((m: any) => m.optionName || m.option_name).join(', ')}</p>
                    )}
                    <p className="text-xs text-gray-400 truncate">by {item.addedByName || item.added_by_name}</p>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                    {isPaid ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700">Paid</span>
                    ) : (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${itemStatusColors[item.status] ?? 'bg-gray-100 text-gray-600'}`}>{item.status}</span>
                    )}
                    <span className="text-xs text-gray-500 w-6 text-center">×{item.quantity}</span>
                    <span className={`text-sm font-semibold min-w-20 sm:min-w-24 text-right whitespace-nowrap ${item.status === 'cancelled' ? 'line-through' : ''}`}>{fmt((item.price ?? 0) * (item.quantity ?? 1))}</span>
                  </div>
                </div>
                );
              })}
            </div>

            <div className="px-4 sm:px-6 py-3 border-t bg-gray-50 space-y-1 [&>div]:gap-3 [&>div>span:last-child]:whitespace-nowrap">
              <div className="flex justify-between text-sm text-gray-500"><span>Subtotal</span><span>{fmt(totals.subtotal)}</span></div>
              {baseTotals.discount > 0 && <div className="flex justify-between text-sm text-emerald-600"><span>Discount</span><span>−{fmt(baseTotals.discount)}</span></div>}
              {presetDiscount > 0 && <div className="flex justify-between text-sm text-emerald-600"><span className="min-w-0 break-words" dir="auto">{branchSettings.discountPresets.find(p => p.id === appliedPresetId)?.label ?? 'Discount'}</span><span>−{fmt(presetDiscount)}</span></div>}
              {loyaltyDiscount > 0 && <div className="flex justify-between text-sm text-amber-600"><span className="min-w-0 break-words">⭐ {loyaltySettings.pointsLabel} Redemption</span><span>−{fmt(loyaltyDiscount)}</span></div>}
              {totals.tax > 0 && <div className="flex justify-between text-sm text-gray-500"><span className="min-w-0 break-words">{branchSettings.taxLabel}{branchSettings.taxInclusive ? ' (incl.)' : ` (${branchSettings.taxRate}%)`}</span><span>{fmt(totals.tax)}</span></div>}
              <div className="flex justify-between text-lg font-bold pt-2 border-t"><span>Total</span><span>{fmt(totals.total)}</span></div>
              {lockedToSplit && <div className="flex justify-between text-sm font-bold text-pink-700"><span>Left to pay</span><span>{fmt(splitLeftDue)}</span></div>}
            </div>

            {canTakePayment && (
              <div className="px-4 sm:px-6 py-4 border-t space-y-3">
                <CustomerPanel
                  branchId={currentUser.branchId}
                  linkedCustomer={linkedCustomer}
                  loyaltyDiscount={loyaltyDiscount}
                  onCustomerChange={setLinkedCustomer}
                  onRedemptionChange={handleRedemptionChange}
                />

                {/* Quick discounts — one-tap presets the tenant admin configured
                    (e.g. Student 10%). Not available on split-by-item (per-guest). */}
                {branchSettings.discountPresets.length > 0 && paymentMode !== 'split-items' && (
                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-1.5">Quick Discount</p>
                    <div className="flex flex-wrap gap-2">
                      {branchSettings.discountPresets.map(preset => {
                        const active = appliedPresetId === preset.id;
                        return (
                          <button
                            key={preset.id}
                            onClick={() => applyPreset(preset)}
                            dir="auto"
                            className={`min-h-10 max-w-full break-words px-3 py-1.5 rounded-xl border-2 text-xs font-semibold transition-all ${
                              active ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-700 hover:border-gray-300'
                            }`}
                          >
                            {preset.label} · {preset.type === 'percentage' ? `${preset.value}%` : fmt(preset.value)}
                            {active && ' ✓'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {paymentMode !== 'split-items' && (
                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-1.5">Discount</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <input value={customValue} onChange={e => setCustomValue(e.target.value)} inputMode="decimal" placeholder="0"
                        aria-label="Discount amount" disabled={appliedPresetId === 'custom'}
                        className="w-24 min-h-10 px-3 rounded-xl border-2 border-gray-200 text-sm focus:outline-none focus:border-emerald-500 disabled:bg-gray-50" />
                      <div className="flex rounded-xl border-2 border-gray-200 overflow-hidden" role="radiogroup" aria-label="Discount type">
                        {(['fixed', 'percentage'] as const).map(t => (
                          <button key={t} type="button" role="radio" aria-checked={customType === t} disabled={appliedPresetId === 'custom'}
                            onClick={() => setCustomType(t)}
                            className={`min-h-10 px-3 text-xs font-bold ${customType === t ? 'bg-gray-900 text-white' : 'text-gray-600'}`}>
                            {t === 'fixed' ? CURRENCY : '%'}
                          </button>
                        ))}
                      </div>
                      {appliedPresetId === 'custom' ? (
                        <button type="button" onClick={() => { setPresetDiscount(0); setAppliedPresetId(null); }}
                          className="min-h-10 px-3 rounded-xl border-2 border-red-200 text-xs font-bold text-red-600">Remove</button>
                      ) : (
                        <button type="button" onClick={applyCustom}
                          className="min-h-10 px-3 rounded-xl border-2 border-emerald-500 text-xs font-bold text-emerald-700">Apply</button>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-x-2">
                  <p className="text-sm font-semibold text-gray-700">Payment Method</p>
                  {lockedToSplit && <p className="text-[11px] font-semibold text-pink-600">Partially paid — continue by item</p>}
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  <button onClick={() => setPaymentMode('cash')} disabled={lockedToSplit} className={`${methodBtn('cash', 'border-emerald-500 bg-emerald-50 text-emerald-700')} disabled:opacity-30 disabled:cursor-not-allowed`}><Banknote className="size-4" />Cash</button>
                  <button onClick={() => setPaymentMode('card')} disabled={lockedToSplit} className={`${methodBtn('card', 'border-blue-500 bg-blue-50 text-blue-700')} disabled:opacity-30 disabled:cursor-not-allowed`}><CreditCard className="size-4" />Card</button>
                  <button onClick={() => setPaymentMode('qr')} disabled={lockedToSplit} className={`${methodBtn('qr', 'border-violet-500 bg-violet-50 text-violet-700')} disabled:opacity-30 disabled:cursor-not-allowed`}><QrCode className="size-4" />QR</button>
                  <button onClick={() => setPaymentMode('account')} disabled={lockedToSplit} className={`${methodBtn('account', 'border-amber-500 bg-amber-50 text-amber-700')} disabled:opacity-30 disabled:cursor-not-allowed`}><HandCoins className="size-4" />Account</button>
                  <button onClick={() => setPaymentMode('mix')} disabled={lockedToSplit} className={`${methodBtn('mix', 'border-orange-500 bg-orange-50 text-orange-700')} disabled:opacity-30 disabled:cursor-not-allowed`}><SplitSquareHorizontal className="size-4" />Mix</button>
                  <button onClick={() => setPaymentMode('split-items')} className={methodBtn('split-items', 'border-pink-500 bg-pink-50 text-pink-700')}><Users className="size-4" />Split</button>
                </div>

                {paymentMode === 'cash' && <CashChangeRow total={totals.total} value={amountReceived} onChange={setAmountReceived} />}

                {paymentMode === 'qr' && (
                  <div className="bg-violet-50 rounded-xl p-4 border border-violet-100 flex flex-col items-center text-center space-y-3 animate-in fade-in zoom-in duration-300">
                    <div className="bg-white p-2 rounded-lg shadow-sm border border-violet-100">
                      <img 
                        src={payQrImage ?? undefined}
                        alt="Payment QR"
                        className="size-32"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-violet-700 uppercase tracking-tight">Scan to Pay</p>
                      <p className="text-[10px] text-violet-600/70 break-words">Dynamic QR generated for {fmt(totals.total)}</p>
                    </div>
                  </div>
                )}

                {paymentMode === 'mix' && (
                  <div className="space-y-2 bg-orange-50 rounded-xl p-3 border border-orange-100">
                    <div className="flex items-center justify-between gap-2 text-xs mb-1">
                      <span className="font-medium text-orange-800">Split Payment</span>
                      <span className={`font-semibold text-right ${splitExact ? 'text-emerald-600' : splitRemain > 0 ? 'text-amber-600' : 'text-red-500'}`}>
                        {splitExact ? '✓ Balanced' : splitRemain > 0 ? `${fmt(splitRemain)} remaining` : `${fmt(splitTotal - totals.total)} over`}
                      </span>
                    </div>
                    {splits.map((entry, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <select value={entry.method} onChange={e => updateSplit(idx, 'method', e.target.value as MixMethod)}
                          className="flex-none w-24 min-h-10 text-xs border border-orange-200 rounded-lg px-2 py-2 bg-white focus:outline-none" disabled={processing}>
                          {(['cash','card','qr','account'] as MixMethod[]).map(m => (
                            <option key={m} value={m} disabled={splits.some((s,i) => i !== idx && s.method === m)}>
                              {m === 'cash' ? '💵 Cash' : m === 'card' ? '💳 Card' : m === 'qr' ? '📱 QR' : '🧾 Account'}
                            </option>
                          ))}
                        </select>
                        <div className="flex-1 min-w-0 relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">{CURRENCY}</span>
                          <input type="number" min="0" step="0.01" placeholder="0.00" value={entry.amount}
                            onChange={e => updateSplit(idx, 'amount', e.target.value)}
                            className="w-full min-h-10 pl-9 pr-2 py-2 text-sm border border-orange-200 rounded-lg bg-white focus:outline-none focus:border-orange-400" disabled={processing} />
                        </div>
                        {splits.length > 1 && (
                          <button onClick={() => setSplits(prev => prev.filter((_, i) => i !== idx))} aria-label="Remove payment row" className="p-2.5 shrink-0 text-red-400 hover:bg-red-50 rounded-lg transition-colors">
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

                {usesAccount && (
                  <div className="space-y-2 bg-amber-50 rounded-xl p-3 border border-amber-100">
                    <p className="text-xs font-medium text-amber-800">Put on the account of — the customer pays later</p>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-gray-400" />
                      <input value={debtSearch} onChange={e => setDebtSearch(e.target.value)} placeholder="Search name or phone"
                        className="w-full pl-8 pr-2 py-2 text-sm border border-amber-200 rounded-lg bg-white focus:outline-none" />
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {debtAccounts === null && <p className="text-xs text-gray-500 py-2">Loading…</p>}
                      {debtAccounts?.filter(a => `${a.name} ${a.phone ?? ''}`.toLowerCase().includes(debtSearch.toLowerCase())).map(a => (
                        <button key={a.id} type="button" onClick={() => setDebtAccountId(a.id)}
                          className={`w-full min-h-11 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 px-3 py-2 rounded-lg border text-left text-sm ${debtAccountId === a.id ? 'border-amber-500 bg-white shadow-sm' : 'border-transparent hover:bg-white/70'}`}>
                          <span className="truncate min-w-0 max-w-full"><span className="font-semibold" dir="auto">{a.name}</span>{a.phone ? <span className="text-gray-500"> · {a.phone}</span> : null}</span>
                          <span className={`ml-auto text-right text-xs ${a.overdue ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                            owes {fmt(a.balance)}{a.creditLimit != null ? ` / ${fmt(a.creditLimit)}` : ''}{a.overdue ? ' · overdue' : ''}
                          </span>
                        </button>
                      ))}
                      {debtAccounts?.length === 0 && <p className="text-xs text-gray-500 py-2">No customer accounts yet — add one below.</p>}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <input value={newDebtName} onChange={e => setNewDebtName(e.target.value)} placeholder="New customer name" dir="auto"
                        className="flex-1 min-w-[10rem] px-2 py-2 text-sm border border-amber-200 rounded-lg bg-white focus:outline-none" />
                      <input value={newDebtPhone} onChange={e => setNewDebtPhone(e.target.value)} placeholder="Phone"
                        className="flex-1 min-w-0 sm:flex-none w-28 px-2 py-2 text-sm border border-amber-200 rounded-lg bg-white focus:outline-none" />
                      <button type="button" onClick={createDebtAccount}
                        className="min-h-10 px-3 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600">Add</button>
                    </div>
                  </div>
                )}

                {paymentMode === 'split-items' && (
                  <div className="space-y-2 bg-pink-50 rounded-xl p-3 border border-pink-100">
                    <div className="bg-white rounded-lg border border-pink-100 p-2.5 space-y-1.5">
                      <p className="text-xs font-semibold text-pink-800">Discount for everyone</p>
                      {lockedToSplit ? (
                        <p className="text-xs text-gray-700">{splitPct > 0 ? `Discount ${splitPct}% for every guest` : 'No discount on this bill'}</p>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {branchSettings.discountPresets.filter(p => p.type === 'percentage').map(preset => {
                            const active = splitPct === preset.value;
                            return (
                              <button key={preset.id} type="button" dir="auto" aria-pressed={active}
                                onClick={() => setSplitPctText(active ? '' : String(preset.value))}
                                className={`min-h-10 max-w-full break-words px-3 py-1.5 rounded-lg border text-[11px] font-semibold ${
                                  active ? 'border-pink-600 bg-pink-600 text-white' : 'border-pink-200 text-pink-700'
                                }`}>
                                {preset.label} · {preset.value}%
                              </button>
                            );
                          })}
                          <label className="flex items-center gap-1 text-xs text-gray-600">
                            <input type="number" min="0" max="100" step="any" inputMode="decimal" placeholder="0"
                              value={splitPctText} onChange={e => setSplitPctText(e.target.value)}
                              aria-label="Discount percent for every guest"
                              className="w-16 min-h-10 px-2 rounded-lg border border-pink-200 text-sm focus:outline-none focus:border-pink-400" />
                            %
                          </label>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 text-xs mb-1">
                      <span className="font-medium text-pink-800">Select what this guest is paying for</span>
                      <span className="font-semibold text-pink-600 shrink-0 whitespace-nowrap">{unpaidItems.length} item{unpaidItems.length !== 1 ? 's' : ''} left</span>
                    </div>

                    {unpaidItems.length === 0 ? (
                      <p className="text-xs text-pink-600 py-3 text-center">Everything on this bill has been paid.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {unpaidItems.map(item => {
                          const checked = splitSelected.has(item.id);
                          return (
                            <button
                              key={item.id}
                              onClick={() => setSplitSelected(prev => {
                                const next = new Set(prev);
                                next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                                return next;
                              })}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-colors ${
                                checked ? 'bg-pink-100 border-pink-300' : 'bg-white border-pink-100 hover:border-pink-200'
                              }`}
                            >
                              <span className={`size-4 rounded flex items-center justify-center border-2 flex-shrink-0 ${checked ? 'bg-pink-600 border-pink-600' : 'border-gray-300'}`}>
                                {checked && <Check className="size-3 text-white" strokeWidth={3} />}
                              </span>
                              <span className="flex-1 min-w-0 text-xs font-medium text-gray-800 truncate" dir="auto">{item.productName || item.product_name} ×{item.quantity}</span>
                              <span className="text-xs font-bold text-gray-900 shrink-0 whitespace-nowrap">{fmt(Number(item.price ?? 0) * Number(item.quantity ?? 1))}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {splitSelected.size > 0 && (
                      <>
                        <div className="grid grid-cols-3 gap-1.5 pt-1">
                          {(['cash', 'card', 'qr'] as SimpleMethod[]).map(m => (
                            <button key={m} onClick={() => setSplitMethod(m)}
                              className={`min-h-10 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                                splitMethod === m ? 'bg-pink-600 border-pink-600 text-white' : 'bg-white border-pink-200 text-pink-700'
                              }`}>
                              {m === 'cash' ? 'Cash' : m === 'card' ? 'Card' : 'QR'}
                            </button>
                          ))}
                        </div>
                        {splitMethod === 'cash' && (
                          <CashChangeRow total={splitSelectedDue} value={splitAmountReceived} onChange={setSplitAmountReceived} />
                        )}
                        <div className="pt-1 text-sm space-y-0.5">
                          <div className="flex justify-between items-center">
                            <span className="text-pink-700 font-medium">Selected items</span>
                            <span className="text-gray-600 whitespace-nowrap">{fmt(splitSelectedTotal)}</span>
                          </div>
                          {splitSelectedNet < splitSelectedTotal && (
                            <div className="flex justify-between items-center text-xs text-emerald-600">
                              <span>Discount {splitPct}%</span>
                              <span className="whitespace-nowrap">−{fmt(splitSelectedTotal - splitSelectedNet)}</span>
                            </div>
                          )}
                          {splitSelectedDue > splitSelectedNet && (
                            <div className="flex justify-between items-center text-xs text-gray-500">
                              <span>{branchSettings.taxLabel} ({branchSettings.taxRate}%)</span>
                              <span>{fmt(splitSelectedDue - splitSelectedNet)}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center font-bold text-gray-900">
                            <span>Due now</span>
                            <span className="whitespace-nowrap">{fmt(splitSelectedDue)}</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
            </div>

            {canTakePayment && (
              <div className="shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-t bg-white flex gap-2">
                <button type="button" onClick={printBill} disabled={processing}
                  className="shrink-0 min-h-12 px-4 rounded-2xl border-2 border-gray-200 text-gray-800 font-bold hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50">
                  <Printer className="size-4" /> <span className="hidden min-[380px]:inline">Print Bill</span>
                </button>
                <button
                  onClick={paymentMode === 'split-items' ? handleSplitPay : handlePayment}
                  disabled={
                    paymentMode === 'split-items'
                      ? (splitProcessing || splitSelected.size === 0)
                      : (processing || (paymentMode === 'mix' && !splitExact) || (usesAccount && !debtAccountId))
                  }
                  className="flex-1 min-w-0 min-h-12 py-3 sm:py-4 px-3 bg-gray-900 text-white rounded-2xl font-bold hover:bg-black transition-all shadow-lg shadow-black/10 flex flex-wrap items-center justify-center gap-x-2 text-center disabled:opacity-50"
                >
                  {paymentMode === 'split-items' ? (
                    splitProcessing ? (
                      <span className="size-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>Pay Selected • {fmt(splitSelectedDue)}</>
                    )
                  ) : processing ? (
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
