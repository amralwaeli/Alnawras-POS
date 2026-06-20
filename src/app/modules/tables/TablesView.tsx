import { useState, useMemo } from 'react';
import { usePOS } from '../../context/POSContext';
import { useNavigate } from 'react-router';
import { supabase } from '../../../lib/supabase';
import { fmt, orderTotal } from '../../../lib/currency';
import { UtensilsCrossed, Users, DollarSign, Clock, ShoppingBag, Package } from 'lucide-react';
import { toast } from 'sonner';
import { PaymentModal } from '../shared/PaymentModal';
import { PickupController } from '../../controllers/PickupController';

// ─── Constants ────────────────────────────────────────────────────────────────

const statusConfig = {
  available: { label: 'Available', dot: 'bg-emerald-500', card: 'border-gray-100 bg-white hover:border-emerald-200', badge: 'bg-emerald-50 text-emerald-700' },
  occupied:  { label: 'Occupied',  dot: 'bg-blue-500',    card: 'border-blue-200 bg-blue-50/40 hover:border-blue-300', badge: 'bg-blue-50 text-blue-700' },
  reserved:  { label: 'Reserved',  dot: 'bg-amber-500',   card: 'border-amber-200 bg-amber-50/40', badge: 'bg-amber-50 text-amber-700' },
};

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

function getOrderType(order: any) {
  return order?.order_type ?? order?.orderType ?? 'dine-in';
}

// ─── Component ────────────────────────────────────────────────────────────────
export function TablesView() {
  const { tables, orders, currentUser, setOrders, setTables } = usePOS();
  const navigate = useNavigate();

  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [pickupBusy, setPickupBusy] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

  // Run a pickup action then optimistically update local state (realtime reconciles).
  const runPickup = async (
    id: string,
    fn: () => Promise<{ success: boolean; error?: string }>,
    okMsg: string,
    apply: (orders: any[]) => any[],
  ) => {
    setPickupBusy(id);
    const res = await fn();
    setPickupBusy(null);
    if (res.success) { toast.success(okMsg); setOrders(prev => apply(prev)); }
    else toast.error(res.error || 'Action failed');
  };

  const handlePaid = async (orderId: string, _billNo: string, _summary: string) => {
    // 1. Update local state
    const paidOrder = orders.find(o => o.id === orderId);
    setOrders(prev => prev.filter(o => o.id !== orderId));
    const targetTable = tables.find(t => t.currentOrderId === orderId);

    // Pickup: paying cash at the counter means the customer is collecting, so
    // mark the order picked and invalidate its single-use link.
    if (paidOrder && getOrderType(paidOrder) === 'pickup') {
      try {
        await PickupController.markPicked(orderId, { id: currentUser?.id, name: currentUser?.name, branchId: currentUser?.branchId });
      } catch (err) {
        console.warn('[Pickup] completion on payment failed', err);
      }
    }
    
    setTables(prev => prev.map(t =>
      t.currentOrderId === orderId
        ? { ...t, status: 'available', currentOrderId: undefined }
        : t
    ));
    setSelectedOrder(null);

    // 2. Harden security: Expire the QR session for this table immediately after payment
    if (targetTable) {
      try {
        await supabase
          .from('qr_sessions')
          .update({ active: false, last_activity_at: new Date().toISOString() })
          .eq('table_id', targetTable.id);
      } catch (err) {
        console.warn('[QR Session] Failed to expire session on payment', err);
      }
    }
  };

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

  // Memoize takeaway orders to ensure it updates when orders change
  const takeawayOrders = useMemo(() =>
    orders.filter(o => getOrderType(o) === 'takeaway' && o.status === 'open'),
    [orders]
  );

  // All active pickup orders (managed inline on this page).
  const pickupOrders = useMemo(() =>
    orders.filter(o => getOrderType(o) === 'pickup' && o.status === 'open'),
    [orders]
  );

  const filteredTables = getFilteredTables();
  const available = filteredTables.filter(t => t.status === 'available').length;
  // Ready to Bill includes both occupied tables AND open takeaway orders
  const occupied  = filteredTables.filter(t => t.status === 'occupied').length + takeawayOrders.length;

  const openOrderModal = async (tableId: string) => {
    try {
      const table = tables.find(t => t.id === tableId);
      const localOrder = getOrder(tableId);

      if (localOrder && localOrder.items?.length > 0) {
        setSelectedOrder({ ...localOrder, tableId, tableNumber: table?.number });
        return;
      }

      const orderItemsSelect = `id, order_id, product_id, product_name, quantity, price, subtotal, status, added_by_name, created_at`;

      let data: any = null;
      let error: any = null;

      if (table?.currentOrderId) {
        const result = await supabase
          .from('orders')
          .select(`*, order_items (${orderItemsSelect})`)
          .eq('id', table.currentOrderId)
          .eq('branch_id', currentUser.branchId)
          .single();
        data = result.data;
        error = result.error;
      }

      // Fallback: find any open order for this table by table_id
      if (!data) {
        const result = await supabase
          .from('orders')
          .select(`*, order_items (${orderItemsSelect})`)
          .eq('table_id', tableId)
          .eq('status', 'open')
          .eq('branch_id', currentUser.branchId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        data = result.data;
        error = result.error;
      }

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
        orderType: getOrderType(data),
        order_type: getOrderType(data),
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
    } catch (err: any) {
      console.error('[openOrderModal] Unexpected error:', err);
      toast.error('Unable to open bill. Please try again.');
    }
  };

  const openTakeawayOrderModal = async (order: any) => {
    try {
      // If order is already in local state with items, use it
      const localOrder = orders.find(o => o.id === order.id);
      if (localOrder && localOrder.items?.length > 0) {
        setSelectedOrder({ ...localOrder, tableId: null, tableNumber: 'Takeaway' });
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
        orderType: getOrderType(data),
        order_type: getOrderType(data),
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
    } catch (err: any) {
      console.error('[openTakeawayOrderModal] Unexpected error:', err);
      toast.error('Unable to open order. Please try again.');
    }
  };

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
          <div className="flex gap-3 items-stretch">
            {(currentUser.role === 'cashier' || currentUser.role === 'admin') && (
              <button
                onClick={() => navigate('/takeaway')}
                className="flex items-center gap-2 bg-purple-600 text-white rounded-xl px-5 font-semibold text-sm shadow-sm hover:bg-purple-700 transition-colors"
              >
                <ShoppingBag className="size-4" /> New Takeaway
              </button>
            )}
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
                        {`Takeaway #${order.billNumber ?? '—'}`}
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

        {/* Pickup Orders — full inline management for the Cashier */}
        {currentUser.role === 'cashier' && pickupOrders.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Package className="size-5 text-orange-600" />
              <h2 className="text-xl font-bold text-gray-900">Pickup Orders</h2>
              <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded-full text-xs font-bold">{pickupOrders.length}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {pickupOrders.map((order: any) => {
                const { total } = calcOrderTotals(order);
                const actor = { id: currentUser?.id, name: currentUser?.name, branchId: currentUser?.branchId };
                const isOnline = order.pickupPayType === 'online';
                const pending = isOnline && order.paymentStatus === 'pending_verification';
                const paid = order.paymentStatus === 'paid';
                const canAdvance = !isOnline || paid;
                const busy = pickupBusy === order.id;
                const methodLabel = order.pickupMethod === 'grab' ? 'Grab Express' : order.pickupMethod === 'lalamove' ? 'Lalamove' : 'Self Pickup';
                return (
                  <div key={order.id} className="rounded-2xl border-2 border-orange-200 bg-orange-50 p-4 shadow-sm flex flex-col">
                    <div className="flex items-start justify-between mb-2">
                      <div className="size-10 bg-orange-200 rounded-xl flex items-center justify-center"><Package className="size-5 text-orange-700" /></div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${order.pickupStatus === 'ready' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{(order.pickupStatus ?? 'preparing').toUpperCase()}</span>
                    </div>
                    <p className="font-bold text-gray-900 text-base">{order.customerName || 'Customer'}</p>
                    <p className="text-xs text-gray-400 mb-2 flex items-center gap-1"><Clock className="size-3" /> #{order.billNumber ?? '—'} · {order.customerPhone}</p>
                    <div className="bg-white/80 rounded-xl p-2.5 space-y-1.5 border border-black/5 mb-2">
                      <div className="flex justify-between text-xs"><span className="text-gray-500">Items</span><span className="font-medium">{order.items?.length ?? 0}</span></div>
                      <div className="flex justify-between text-xs"><span className="text-gray-500 flex items-center gap-1"><DollarSign className="size-3" />Total</span><span className="font-bold text-gray-900">{fmt(total)}</span></div>
                      <div className="flex justify-between text-xs"><span className="text-gray-500">Method</span><span className="font-medium">{methodLabel}</span></div>
                      <div className="flex justify-between text-xs"><span className="text-gray-500">Payment</span>
                        <span className="font-bold">{isOnline ? (order.paymentStatus === 'paid' ? 'Online · Paid' : order.paymentStatus === 'rejected' ? 'Online · Rejected' : 'Online · Verify') : 'Cash'}</span>
                      </div>
                    </div>

                    {/* Online payment verification */}
                    {pending && (
                      <div className="space-y-1.5 mb-2">
                        {order.paymentReceiptUrl && (
                          <button onClick={() => setReceiptUrl(order.paymentReceiptUrl)} className="w-full py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-bold">View Receipt</button>
                        )}
                        <div className="grid grid-cols-2 gap-1.5">
                          <button disabled={busy} onClick={() => runPickup(order.id, () => PickupController.approvePayment(order.id, actor), 'Payment approved', prev => prev.map(o => o.id === order.id ? { ...o, paymentStatus: 'paid' } : o))} className="py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-bold disabled:opacity-50">Approve</button>
                          <button disabled={busy} onClick={() => runPickup(order.id, () => PickupController.rejectPayment(order.id, actor), 'Payment rejected', prev => prev.map(o => o.id === order.id ? { ...o, paymentStatus: 'rejected' } : o))} className="py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold disabled:opacity-50">Reject</button>
                        </div>
                      </div>
                    )}

                    {/* Status / collection actions */}
                    <div className="mt-auto space-y-1.5">
                      {canAdvance && order.pickupStatus !== 'ready' && (
                        <button disabled={busy} onClick={() => runPickup(order.id, () => PickupController.setPickupStatus(order.id, 'ready', actor), 'Marked Ready', prev => prev.map(o => o.id === order.id ? { ...o, pickupStatus: 'ready' } : o))} className="w-full py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold disabled:opacity-50">Mark Ready</button>
                      )}
                      {canAdvance && order.pickupStatus === 'ready' && !isOnline && (
                        <button onClick={() => setSelectedOrder({ ...order, tableId: null, tableNumber: 'Pickup' })} className="w-full py-2 bg-orange-600 text-white rounded-xl text-xs font-semibold">Collect Cash</button>
                      )}
                      {canAdvance && order.pickupStatus === 'ready' && isOnline && (
                        <button disabled={busy} onClick={() => runPickup(order.id, () => PickupController.markPicked(order.id, actor), 'Order collected', prev => prev.filter(o => o.id !== order.id))} className="w-full py-2 bg-gray-900 text-white rounded-xl text-xs font-semibold disabled:opacity-50">Mark Picked</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Pickup receipt viewer */}
        {receiptUrl && (
          <div className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4" onClick={() => setReceiptUrl(null)}>
            <img src={receiptUrl} alt="Payment receipt" className="max-h-[90vh] max-w-full rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
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
                    {table.needsWaiter && (
                      <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-bold">
                        Waiter call
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
                    {(currentUser.role === 'waiter' || currentUser.role === 'swaiter') && (
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
                    {currentUser.role === 'cashier' && table.status === 'occupied' && (
                      <button
                        onClick={() => void openOrderModal(table.id)}
                        className="w-full py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 transition-colors mt-1"
                      >
                        Open Bill
                      </button>
                    )}
                    {(currentUser.role === 'waiter' || currentUser.role === 'swaiter' || currentUser.role === 'admin') && (
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

      {/* ── Payment Modal (shared, includes loyalty panel) ─────────────────── */}
      {selectedOrder && (
        <PaymentModal
          isOpen={!!selectedOrder}
          order={selectedOrder}
          currentUser={currentUser}
          onClose={() => setSelectedOrder(null)}
          onPaid={handlePaid}
        />
      )}
    </div>
  );
}
