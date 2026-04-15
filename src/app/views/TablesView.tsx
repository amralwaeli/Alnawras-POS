import { useState, useMemo } from 'react';
import { usePOS } from '../context/POSContext';
import { useNavigate } from 'react-router';
import { supabase } from '../../lib/supabase';
import { CURRENCY, fmt, orderTotal } from '../../lib/currency';
import { loadBillFormatSettings } from '../../lib/billFormat';
import {
  UtensilsCrossed, Users, DollarSign, X, Clock, CheckCircle,
  CreditCard, Banknote, QrCode, SplitSquareHorizontal, Plus, Minus,
  ShoppingBag,
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
  if (!order) return { subtotal: 0, tax: 0, discount: 0, total: 0 };
  
  const total = orderTotal(order);
  const items: any[] = order?.items ?? order?.order_items ?? [];
  const subtotal = items.reduce((s, i) => {
    const price = Number(i.price ?? i.unit_price ?? 0);
    const qty = Number(i.quantity ?? i.qty ?? 1);
    return s + (price * qty);
  }, 0);
  
  const tax = Number(order?.tax ?? order?.tax_amount ?? 0);
  const discount = Number(order?.discount ?? order?.discount_amount ?? 0);
  
  return { 
    subtotal: subtotal > 0 ? subtotal : Number(order?.subtotal ?? 0), 
    tax, 
    discount, 
    total 
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function printReceipt(order: any, paymentSummary: string, billNo: string) {
  const settings = loadBillFormatSettings();
  const totals = calcOrderTotals(order);
  const items = order?.items ?? order?.order_items ?? [];

  const rows = items.map((item: any) => {
    const name = escapeHtml(item.productName || item.product_name || 'Item');
    const price = Number(item.price ?? item.unit_price ?? 0).toFixed(2);
    const qty = Number(item.quantity ?? item.qty ?? 1);
    const amount = Number(item.subtotal ?? (item.price ?? item.unit_price ?? 0) * (item.quantity ?? item.qty ?? 1)).toFixed(2);

    return `
      <div class="item-block">
        <div class="item-name">${name}</div>
        <div class="item-row">
          <span></span>
          <span class="right">${price}</span>
          <span class="right">${qty}</span>
          <span class="right">0.00</span>
          <span class="right">${amount}</span>
        </div>
      </div>
    `;
  }).join('');

  const printWindow = window.open('', '', 'width=420,height=900');
  if (!printWindow) {
    toast.error('Please allow pop-ups to print receipts');
    return;
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>Receipt ${billNo}</title>
        <style>
          body { margin: 0; background: #fff; font-family: "Courier New", monospace; }
          .receipt { width: 290px; margin: 0 auto; padding: 24px 20px; color: #3f3a33; }
          .center { text-align: center; }
          .logo { width: 58px; height: 58px; border: 3px solid #7b7368; border-radius: 999px; margin: 0 auto 10px; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 700; }
          .tagline { font-family: Georgia, serif; font-style: italic; font-size: 20px; }
          .restaurant { margin-top: 8px; font-size: 15px; font-weight: 700; text-transform: uppercase; }
          .table-note { margin-top: 12px; font-size: 13px; }
          .table-no { font-size: 34px; font-weight: 700; line-height: 1; }
          .divider { border-top: 1px dashed #bcb6aa; margin: 14px 0; }
          .meta { font-size: 11px; line-height: 1.5; }
          .meta-row { display: flex; justify-content: space-between; gap: 12px; }
          .header-row, .item-row, .total-row { display: grid; grid-template-columns: 1.6fr .7fr .45fr .75fr .8fr; gap: 8px; }
          .header-row { font-size: 10px; font-weight: 700; text-transform: uppercase; }
          .item-block { margin-top: 10px; font-size: 11px; }
          .item-name { font-weight: 700; line-height: 1.3; margin-bottom: 2px; }
          .right { text-align: right; }
          .totals { font-size: 11px; line-height: 1.8; }
          .totals-line { display: flex; justify-content: space-between; gap: 12px; }
          .grand-total { font-size: 14px; font-weight: 700; margin-top: 4px; }
          .thanks { text-align: center; margin-top: 14px; font-size: 12px; font-weight: 700; }
          .footer { text-align: center; margin-top: 14px; font-size: 10px; text-transform: uppercase; }
          .payment { margin-top: 8px; font-size: 10px; text-align: center; }
          @media print {
            body { margin: 0; }
            .receipt { width: auto; }
          }
        </style>
      </head>
      <body onload="window.print(); window.close();">
        <div class="receipt">
          <div class="center">
            <div class="logo">S</div>
            <div class="tagline">${escapeHtml(settings.branchTagline)}</div>
            <div class="restaurant">${escapeHtml(settings.restaurantName)}</div>
            <div class="table-note">${escapeHtml(settings.headerNote)}</div>
            <div class="table-no">${escapeHtml(String(order.tableNumber || order.table_number || '-'))}</div>
          </div>

          <div class="divider"></div>

          <div class="meta">
            <div>${escapeHtml(settings.cashierLabel)}</div>
            <div class="meta-row">
              <span>${escapeHtml(settings.registerLabel)}</span>
              <span>Bill No: ${escapeHtml(billNo)}</span>
            </div>
          </div>

          <div class="divider"></div>

          <div class="header-row">
            <span>Item</span>
            <span class="right">Price</span>
            <span class="right">Qty</span>
            <span class="right">Disc</span>
            <span class="right">Amt</span>
          </div>
          ${rows}

          <div class="divider"></div>

          <div class="totals">
            <div class="totals-line">
              <span>${escapeHtml(settings.subtotalLabel)}</span>
              <span>${CURRENCY} ${totals.subtotal.toFixed(2)}</span>
            </div>
            <div class="totals-line">
              <span>${escapeHtml(settings.discountLabel)}</span>
              <span>${CURRENCY} ${totals.discount.toFixed(2)}</span>
            </div>
            <div class="totals-line">
              <span>${escapeHtml(settings.taxLabel)}</span>
              <span>${CURRENCY} ${totals.tax.toFixed(2)}</span>
            </div>
            <div class="totals-line grand-total">
              <span>${escapeHtml(settings.totalLabel)}</span>
              <span>${CURRENCY} ${totals.total.toFixed(2)}</span>
            </div>
          </div>

          <div class="payment">Payment: ${escapeHtml(paymentSummary)}</div>

          <div class="divider"></div>

          <div class="thanks">${escapeHtml(settings.thankYouMessage)}</div>
          <div class="footer">${escapeHtml(settings.footerNote)}</div>
        </div>
      </body>
    </html>
  `);
  printWindow.document.close();
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
  const [showPrintPrompt, setShowPrintPrompt] = useState(false);
  const [lastBillNo, setLastBillNo] = useState('');
  const [lastPaymentSummary, setLastPaymentSummary] = useState('');
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

  const getFilteredTables = () => {
    if (currentUser.role === 'cashier') {
      return tables.filter(t => t.status === 'occupied');
    }
    return tables;
  };

  const getTakeawayOrders = () => {
    return orders.filter(o => o.order_type === 'takeaway' && o.status === 'open');
  };

  const filteredTables = getFilteredTables();
  const takeawayOrders = getTakeawayOrders();
  const available = filteredTables.filter(t => t.status === 'available').length;
  const occupied  = filteredTables.filter(t => t.status === 'occupied').length;

  const openOrderModal = async (tableId: string) => {
    try {
      console.log('[openOrderModal] Opening bill for table:', tableId);
      
      const table = tables.find(t => t.id === tableId);
      console.log('[openOrderModal] Table found:', table);
      
      const localOrder = getOrder(tableId);
      console.log('[openOrderModal] Local order:', localOrder);

      if (localOrder && localOrder.items?.length > 0) {
        console.log('[openOrderModal] Using local order with items');
        setSelectedOrder({ ...localOrder, tableId, tableNumber: table?.number });
        setPaymentMode(null);
        setSplits([{ method: 'cash', amount: '' }, { method: 'card', amount: '' }]);
        return;
      }

      if (!table?.currentOrderId) {
        console.warn('[openOrderModal] No currentOrderId on table');
        toast.error('No active bill found for this table');
        return;
      }

      console.log('[openOrderModal] Fetching from Supabase, orderId:', table.currentOrderId);
      
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (
            id,
            order_id,
            product_id,
            product_name,
            quantity,
            price,
            subtotal,
            status,
            added_by_name,
            created_at
          )
        `)
        .eq('id', table.currentOrderId)
        .eq('branch_id', currentUser.branchId)
        .single();

      if (error) {
        console.error('[openOrderModal] Supabase fetch error:', error);
        toast.error('Failed to load bill: ' + error.message);
        return;
      }

      if (!data) {
        console.warn('[openOrderModal] No data returned from Supabase');
        console.warn('[openOrderModal] The table references order:', table.currentOrderId, 'which does not exist');
        
        // Clear the invalid order reference from the table
        await supabase
          .from('tables')
          .update({ current_order_id: null })
          .eq('id', tableId);
        
        setTables(prev => prev.map(t => 
          t.id === tableId ? { ...t, currentOrderId: undefined } : t
        ));
        
        toast.error('The bill for this table no longer exists. Reference has been cleared.');
        return;
      }

      console.log('[openOrderModal] Order data from Supabase:', data);
      console.log('[openOrderModal] Order items count:', data.order_items?.length || 0);

      const normalizedOrder = {
        id: data.id,
        tableId: data.table_id || tableId,
        tableNumber: data.table_number || table?.number || '-',
        status: data.status,
        subtotal: Number(data.subtotal || 0),
        tax: Number(data.tax || 0),
        discount: Number(data.discount || 0),
        total: Number(data.total || 0),
        createdAt: data.created_at ? new Date(data.created_at) : new Date(),
        completedAt: data.completed_at ? new Date(data.completed_at) : undefined,
        paymentMethod: data.payment_method,
        cashierId: data.cashier_id,
        cashierName: data.cashier_name,
        orderType: data.order_type || 'dine-in',
        billNumber: data.bill_number,
        items: (data.order_items || []).map((item: any) => ({
          id: item.id,
          orderId: item.order_id,
          productId: item.product_id,
          productName: item.product_name || 'Item',
          quantity: Number(item.quantity || 1),
          price: Number(item.price || 0),
          subtotal: Number(item.subtotal || 0),
          status: item.status || 'pending',
          addedByName: item.added_by_name || 'Unknown',
          addedAt: item.created_at ? new Date(item.created_at) : new Date(),
        })),
      };

      console.log('[openOrderModal] Normalized order:', normalizedOrder);

      setOrders(prev => {
        const exists = prev.some(o => o.id === normalizedOrder.id);
        return exists
          ? prev.map(o => o.id === normalizedOrder.id ? normalizedOrder : o)
          : [...prev, normalizedOrder];
      });

      setSelectedOrder(normalizedOrder);
      setPaymentMode(null);
      setSplits([{ method: 'cash', amount: '' }, { method: 'card', amount: '' }]);
      
      console.log('[openOrderModal] Successfully opened bill');

    } catch (err: any) {
      console.error('[openOrderModal] Unexpected error:', err);
      toast.error('Unable to open bill. Please try again.');
    }
  };

  const openTakeawayOrderModal = async (order: any) => {
    try {
      console.log('[openTakeawayOrderModal] Opening takeaway order:', order.id);
      
      // If order is already in local state with items, use it
      const localOrder = orders.find(o => o.id === order.id);
      if (localOrder && localOrder.items?.length > 0) {
        setSelectedOrder({ ...localOrder, tableId: null, tableNumber: 'Takeaway' });
        setPaymentMode(null);
        setSplits([{ method: 'cash', amount: '' }, { method: 'card', amount: '' }]);
        return;
      }

      // Fetch from Supabase
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (
            id,
            order_id,
            product_id,
            product_name,
            quantity,
            price,
            subtotal,
            status,
            added_by_name,
            created_at
          )
        `)
        .eq('id', order.id)
        .eq('branch_id', currentUser.branchId)
        .single();

      if (error) {
        console.error('[openTakeawayOrderModal] Supabase fetch error:', error);
        toast.error('Failed to load order: ' + error.message);
        return;
      }

      if (!data) {
        toast.error('Order not found');
        return;
      }

      const normalizedOrder = {
        id: data.id,
        tableId: null,
        tableNumber: 'Takeaway',
        status: data.status,
        subtotal: Number(data.subtotal || 0),
        tax: Number(data.tax || 0),
        discount: Number(data.discount || 0),
        total: Number(data.total || 0),
        createdAt: data.created_at ? new Date(data.created_at) : new Date(),
        completedAt: data.completed_at ? new Date(data.completed_at) : undefined,
        paymentMethod: data.payment_method,
        cashierId: data.cashier_id,
        cashierName: data.cashier_name,
        orderType: data.order_type || 'takeaway',
        billNumber: data.bill_number,
        items: (data.order_items || []).map((item: any) => ({
          id: item.id,
          orderId: item.order_id,
          productId: item.product_id,
          productName: item.product_name || 'Item',
          quantity: Number(item.quantity || 1),
          price: Number(item.price || 0),
          subtotal: Number(item.subtotal || 0),
          status: item.status || 'pending',
          addedByName: item.added_by_name || 'Unknown',
          addedAt: item.created_at ? new Date(item.created_at) : new Date(),
        })),
      };

      setOrders(prev => {
        const exists = prev.some(o => o.id === normalizedOrder.id);
        return exists
          ? prev.map(o => o.id === normalizedOrder.id ? normalizedOrder : o)
          : [...prev, normalizedOrder];
      });

      setSelectedOrder(normalizedOrder);
      setPaymentMode(null);
      setSplits([{ method: 'cash', amount: '' }, { method: 'card', amount: '' }]);
      
      console.log('[openTakeawayOrderModal] Successfully opened order');

    } catch (err: any) {
      console.error('[openTakeawayOrderModal] Unexpected error:', err);
      toast.error('Unable to open order. Please try again.');
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

  const handlePrintReceipt = () => {
    printReceipt(selectedOrder, lastPaymentSummary, lastBillNo);
    setShowPrintPrompt(false);
    setSelectedOrder(null);
    setPaymentMode(null);
  };

  const handleSkipPrint = () => {
    setShowPrintPrompt(false);
    setSelectedOrder(null);
    setPaymentMode(null);
  };

  const handlePayment = async () => {
    if (!selectedOrder || !paymentMode) return;

    if (selectedOrder.status === 'completed') {
      toast.error('This bill has already been paid');
      return;
    }

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

      // Get the count of ALL completed orders (both dine-in and takeaway) for sequential billing
      const { count } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('branch_id', currentUser.branchId)
        .eq('status', 'completed');

      // Sequential bill number starting from 0001 for ALL orders
      const billNo = String((count || 0) + 1).padStart(4, '0');
      const summary = paymentMode === 'mix'
        ? splits.map(s => `${s.method.toUpperCase()} ${fmt(parseFloat(s.amount))}`).join(' + ')
        : paymentMode.toUpperCase();

      await supabase
        .from('orders')
        .update({
          status: 'completed',
          completed_at: now,
          payment_method: summary,
          bill_number: billNo,
        })
        .eq('id', selectedOrder.id);

      await supabase
        .from('orders')
        .update({
          status: 'completed',
          completed_at: now,
          payment_method: summary,
        })
        .eq('id', selectedOrder.id);
      
      await supabase
        .from('tables')
        .update({
          status: 'available',
          current_order_id: null
        })
        .eq('id', selectedOrder.tableId);

      console.log('[handlePayment] Database updated. Table set to available, order cleared.');

      // Store bill info for optional printing
      setLastBillNo(billNo);
      setLastPaymentSummary(summary);

      // Update local state immediately for responsive UI
      setOrders(prev => prev.map(o =>
        o.id === selectedOrder.id
          ? { ...o, status: 'completed', paymentMethod: summary }
          : o
      ));
      setTables(prev => prev.map(t =>
        t.id === selectedOrder.tableId
          ? { ...t, status: 'available', currentOrderId: undefined }
          : t
      ));

      console.log('[handlePayment] Local state updated. Payment flow complete.');

      toast.success(`Payment of ${fmt(totals.total)} processed via ${summary}`);
      
      // Show print prompt instead of auto-printing
      setShowPrintPrompt(true);
      
    } catch (err: any) {
      console.error('Payment error:', err);
      toast.error('Payment failed: ' + (err.message || 'Please try again'));
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
            <p className="text-gray-500 text-sm mt-0.5">
              {currentUser.role === 'cashier' 
                ? 'Occupied tables — ready for payment'
                : 'Live table status — updates in real time'}
            </p>
          </div>
          <div className="flex gap-3">
            {currentUser.role !== 'cashier' && (
              <div className="text-center bg-white rounded-xl px-5 py-3 border border-gray-100 shadow-sm">
                <p className="text-2xl font-bold text-emerald-600">{available}</p>
                <p className="text-xs text-gray-400">Available</p>
              </div>
            )}
            <div className="text-center bg-white rounded-xl px-5 py-3 border border-gray-100 shadow-sm">
              <p className="text-2xl font-bold text-blue-600">{occupied}</p>
              <p className="text-xs text-gray-400">{currentUser.role === 'cashier' ? 'Ready to Bill' : 'Occupied'}</p>
            </div>
          </div>
        </div>

        {/* Takeaway Orders Section - Only for Cashier */}
        {currentUser.role === 'cashier' && takeawayOrders.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <ShoppingBag className="size-5 text-purple-600" />
              <h2 className="text-xl font-bold text-gray-900">Takeaway Orders</h2>
              <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full text-xs font-bold">{takeawayOrders.length}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {takeawayOrders.map(order => {
                const { total } = calcOrderTotals(order);
                const pendingItems = order?.items?.filter((i: any) => i.status === 'pending').length ?? 0;

                return (
                  <div key={order.id} className="rounded-2xl border-2 border-purple-200 bg-purple-50 p-4 cursor-pointer transition-all shadow-sm hover:border-purple-300 hover:shadow-md">
                    <div className="flex items-start justify-between mb-3">
                      <div className="size-10 bg-purple-200 rounded-xl flex items-center justify-center">
                        <ShoppingBag className="size-5 text-purple-700" />
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full bg-purple-100 text-purple-700">
                          <span className="size-1.5 rounded-full bg-purple-500" />
                          Takeaway
                        </span>
                        {pendingItems > 0 && (
                          <span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold animate-pulse">
                            {pendingItems} new
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-lg">
                        {order.billNumber ? `Bill #${order.billNumber}` : `Takeaway #${order.id.slice(-4)}`}
                      </p>
                      <p className="text-xs text-gray-400 mb-3 flex items-center gap-1">
                        <Clock className="size-3" /> {order.createdAt ? new Date(order.createdAt).toLocaleTimeString() : '—'}
                      </p>
                    </div>
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
                      <button
                        onClick={() => openTakeawayOrderModal(order)}
                        className="w-full py-2 bg-purple-600 text-white rounded-xl text-xs font-semibold hover:bg-purple-700 transition-colors"
                      >
                        Process Payment
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Table Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredTables.map(table => {
            const order = getOrder(table.id);
            const cfg = statusConfig[table.status];
            const pendingItems = order?.items?.filter((i: any) => i.status === 'pending').length ?? 0;
            const { total } = calcOrderTotals(order);
            
            const hasOrderWithItems = order && order.items?.length > 0;
            
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
                      <button 
                        onClick={() => void openOrderModal(table.id)} 
                        className="w-full py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 transition-colors"
                      >
                        {hasOrderWithItems ? 'Process Payment' : 'Open Bill'}
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
                  <>
                    {currentUser.role === 'cashier' && table.status === 'occupied' && table.currentOrderId && (
                      <button 
                        onClick={() => void openOrderModal(table.id)} 
                        className="w-full py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 transition-colors mt-1"
                      >
                        Open Bill
                      </button>
                    )}
                    {(currentUser.role === 'waiter' || currentUser.role === 'admin') && (
                      <button onClick={() => navigate(`/table/${table.id}`)} className="w-full py-2 bg-gray-900 text-white rounded-xl text-xs font-semibold hover:bg-gray-800 transition-colors mt-1">
                        Start Order
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {filteredTables.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
            <UtensilsCrossed className="size-12 opacity-30" />
            <p className="text-sm text-center">
              {currentUser.role === 'cashier' 
                ? 'No occupied tables — all tables have been paid'
                : 'No tables found — add tables in Manage Tables'}
            </p>
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
                <h2 className="font-bold text-lg">
                  {selectedOrder.orderType === 'takeaway' ? 'Takeaway Order' : `Table ${selectedOrder.tableNumber}`}
                </h2>
                <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                  <Clock className="size-3" />
                  {selectedOrder.billNumber ? `Bill #${selectedOrder.billNumber} • ` : ''}
                  {selectedOrder.createdAt ? new Date(selectedOrder.createdAt).toLocaleTimeString() : '—'}
                </p>
              </div>
              <button 
                onClick={() => { setSelectedOrder(null); setPaymentMode(null); }} 
                className="p-2 rounded-xl hover:bg-gray-100"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Items list */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
              {(selectedOrder.items ?? []).length === 0 ? (
                <p className="text-center text-gray-400 py-8">No items in this order</p>
              ) : (
                (selectedOrder.items ?? []).map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.productName || item.product_name}</p>
                      <p className="text-xs text-gray-400">by {item.addedByName || item.added_by_name}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
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

            {/* Payment section - ONLY for cashier or admin, and only if not already paid */}
            {(currentUser.role === 'cashier' || currentUser.role === 'admin') && selectedOrder.status !== 'completed' && (
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
                          disabled={processing}
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
                            className="w-full pl-9 pr-2 py-2 text-sm border border-orange-200 rounded-lg bg-white focus:outline-none focus:border-orange-400 disabled:bg-gray-50"
                            disabled={processing}
                          />
                        </div>

                        <button
                          onClick={() => fillRemaining(idx)}
                          title="Fill remaining"
                          className="text-xs px-2 py-2 bg-white border border-orange-200 hover:bg-orange-100 rounded-lg text-orange-700 whitespace-nowrap disabled:opacity-50"
                          disabled={processing}
                        >
                          Fill
                        </button>

                        {splits.length > 2 && (
                          <button 
                            onClick={() => removeSplitRow(idx)} 
                            className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 disabled:opacity-50"
                            disabled={processing}
                          >
                            <Minus className="size-3.5" />
                          </button>
                        )}
                      </div>
                    ))}

                    {splits.length < 3 && (
                      <button 
                        onClick={addSplitRow} 
                        className="flex items-center gap-1.5 text-xs text-orange-600 hover:text-orange-800 py-1 disabled:opacity-50"
                        disabled={processing}
                      >
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
            
            {/* Show "Already Paid" badge if order is completed */}
            {selectedOrder.status === 'completed' && (
              <div className="px-6 py-4 border-t bg-emerald-50">
                <div className="flex items-center justify-center gap-2 text-emerald-700 font-medium">
                  <CheckCircle className="size-4" />
                  <span>Bill already paid via {selectedOrder.paymentMethod}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Print Prompt Modal ─────────────────────────────────────────────── */}
      {showPrintPrompt && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="font-bold text-lg">Payment Completed</h2>
                <p className="text-xs text-gray-400 mt-0.5">Bill #{lastBillNo}</p>
              </div>
              <button
                onClick={handleSkipPrint}
                className="p-2 rounded-xl hover:bg-gray-100"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Content */}
            <div className="px-6 py-8 text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
                <CheckCircle className="size-8 text-emerald-600" />
              </div>
              <div>
                <p className="text-lg font-semibold text-gray-900">Payment Successful!</p>
                <p className="text-sm text-gray-500 mt-1">Would you like to print a receipt?</p>
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 py-4 border-t space-y-3">
              <button
                onClick={handlePrintReceipt}
                className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 6 2 18 2 18 9"></polyline>
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                  <rect x="6" y="14" width="12" height="8"></rect>
                </svg>
                Print Receipt
              </button>
              <button
                onClick={handleSkipPrint}
                className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
              >
                Skip Printing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}