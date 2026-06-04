import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { supabase } from '../../../lib/supabase';
import { Product, Category, Table } from '../../models/types';
import { toast } from 'sonner';
import {
  Plus, Minus, ShoppingCart, X, Search,
  CheckCircle2, ShoppingBag, Bell, ChevronDown, UtensilsCrossed,
} from 'lucide-react';

interface CartItem {
  id: string;
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  station: string;
  notes: string;
}

interface ExistingItem {
  id: string;
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  status: string;
}

export function QROrderingView() {
  const { tableId } = useParams();

  const [table, setTable]               = useState<Table | null>(null);
  const [orderId, setOrderId]           = useState<string | null>(null);
  const [existingItems, setExistingItems] = useState<ExistingItem[]>([]);
  const [products, setProducts]         = useState<Product[]>([]);
  const [categories, setCategories]     = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery]   = useState('');
  const [cartItems, setCartItems]       = useState<CartItem[]>([]);
  const [loading, setLoading]           = useState(true);
  const [submitting, setSubmitting]     = useState(false);
  const [success, setSuccess]           = useState(false);
  const [invalidTable, setInvalidTable] = useState(false);
  const [callingWaiter, setCallingWaiter] = useState(false);
  const [mobileView, setMobileView]     = useState<'menu' | 'cart'>('menu');
  const [expandedNotes, setExpandedNotes] = useState<string | null>(null);

  // ── Load table, products, categories, open order ──────────────────────────
  useEffect(() => {
    const load = async () => {
      if (!tableId) { setInvalidTable(true); setLoading(false); return; }
      setLoading(true);

      const { data: tableRow, error } = await supabase
        .from('tables').select('*').eq('id', tableId).single();
      if (error || !tableRow) { setInvalidTable(true); setLoading(false); return; }

      const branchId = tableRow.branch_id;
      setTable({
        id: tableRow.id, number: tableRow.number, capacity: tableRow.capacity,
        status: tableRow.status, branchId, currentOrderId: tableRow.current_order_id,
        assignedCashierId: tableRow.assigned_cashier_id,
        needsWaiter: tableRow.needs_waiter ?? false,
      });

      const [productsRes, categoriesRes] = await Promise.all([
        supabase.from('products').select('*').eq('branch_id', branchId).eq('is_active', true).order('name'),
        supabase.from('categories').select('*').eq('branch_id', branchId).eq('is_active', true).order('display_order'),
      ]);

      const prods: Product[] = (productsRes.data || []).map((p: any) => ({
        id: p.id, name: p.name, category: p.category ?? '', categoryId: p.category_id,
        price: Number(p.price), stock: p.stock ?? 0, image: p.image,
        sku: p.sku, taxRate: Number(p.tax_rate ?? 0), reorderPoint: p.reorder_point ?? 0,
        branchId: p.branch_id, station: p.station ?? 'kitchen',
        kitchenStatus: p.kitchen_status ?? 'available',
        availabilityStatus: p.availability_status ?? 'available',
        isActive: p.is_active ?? true, createdAt: new Date(p.created_at),
      }));
      setProducts(prods);

      const cats: Category[] = (categoriesRes.data || [])
        .map((c: any) => ({
          id: c.id, name: c.name, description: c.description,
          color: c.color ?? '#f97316', icon: c.icon,
          displayOrder: Number(c.display_order ?? 0), isActive: c.is_active ?? true,
          branchId: c.branch_id, createdAt: new Date(c.created_at),
        }))
        .filter(c => c.isActive);
      setCategories(cats);
      if (cats.length) setSelectedCategory(cats[0].id);

      // Load open order if exists
      if (tableRow.current_order_id) {
        const { data: orderData } = await supabase
          .from('orders').select('*, order_items(*)').eq('id', tableRow.current_order_id).single();
        if (orderData) {
          setOrderId(orderData.id);
          setExistingItems((orderData.order_items || []).map((item: any) => ({
            id: item.id, productId: item.product_id, productName: item.product_name,
            price: Number(item.price), quantity: Number(item.quantity), status: item.status,
          })));
        }
      }

      // Track QR session
      try {
        const { data: existing } = await supabase.from('qr_sessions').select('*').eq('table_id', tableId).single();
        const now = new Date().toISOString();
        if (existing) {
          await supabase.from('qr_sessions').update({ active: true, last_activity_at: now }).eq('table_id', tableId);
        } else {
          await supabase.from('qr_sessions').insert([{
            id: `qr-session-${tableId}`, table_id: tableId, active: true,
            started_at: now, last_activity_at: now, branch_id: branchId,
          }]);
        }
      } catch { /* silent — qr_sessions table may not exist yet */ }

      setLoading(false);
    };
    void load();
  }, [tableId]);

  // ── Realtime: keep product availability in sync ──────────────────────────
  useEffect(() => {
    if (!table?.branchId) return;
    const channel = supabase
      .channel(`qr-products-${table.branchId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'products', filter: `branch_id=eq.${table.branchId}` }, (payload) => {
        const up = payload.new as any;
        setProducts(prev => prev.map(p =>
          p.id === up.id
            ? { ...p, kitchenStatus: up.kitchen_status ?? 'available', availabilityStatus: up.availability_status ?? 'available' }
            : p
        ));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [table?.branchId]);

  // ── Filtered products ────────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const activeCategory = categories.find(c => c.id === selectedCategory);
    return products.filter(p => {
      // When searching, scan all products regardless of selected tab
      if (q) return p.name.toLowerCase().includes(q);
      // Otherwise filter by selected category tab
      return selectedCategory
        ? p.categoryId === selectedCategory ||
          (!!activeCategory && p.category?.toLowerCase() === activeCategory.name.toLowerCase())
        : false;
    });
  }, [products, categories, selectedCategory, searchQuery]);

  const totalItems    = cartItems.reduce((s, i) => s + i.quantity, 0);
  const cartTotal     = cartItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const existingTotal = existingItems.reduce((s, i) => s + i.price * i.quantity, 0);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const addToCart = (product: Product) => {
    setCartItems(prev => {
      const ex = prev.find(i => i.productId === product.id);
      if (ex) return prev.map(i => i.id === ex.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, {
        id: `new-${Date.now()}`, productId: product.id, productName: product.name,
        price: product.price, quantity: 1, station: product.station || 'kitchen', notes: '',
      }];
    });
  };

  const handleCallWaiter = async () => {
    if (!table) return;
    setCallingWaiter(true);
    const { error } = await supabase.from('tables').update({ needs_waiter: true }).eq('id', table.id);
    if (error) toast.error('Could not call waiter. Try again.');
    else { setTable(prev => prev ? { ...prev, needsWaiter: true } : prev); toast.success('Waiter has been notified!'); }
    setCallingWaiter(false);
  };

  const handleSubmitOrder = async () => {
    if (!table || cartItems.length === 0) { toast.error('Add items to your order first.'); return; }
    setSubmitting(true);
    try {
      let oid = orderId || table.currentOrderId;

      if (!oid) {
        const newOid = crypto.randomUUID();

        // Atomic claim: only update if another session hasn't already created an order
        const { data: claimedTable, error: claimErr } = await supabase
          .from('tables')
          .update({ status: 'occupied', current_order_id: newOid })
          .eq('id', table.id)
          .is('current_order_id', null)
          .select('current_order_id')
          .maybeSingle();

        if (claimErr || !claimedTable) {
          // Another session won the race — fetch their order ID instead
          const { data: freshTable } = await supabase
            .from('tables').select('current_order_id').eq('id', table.id).single();
          oid = freshTable?.current_order_id ?? null;
        } else {
          oid = newOid;
          const { error: orderErr } = await supabase.from('orders').insert([{
            id: oid, table_id: table.id, table_number: table.number,
            subtotal: 0, tax: 0, discount: 0, total: 0,
            status: 'open', payment_status: 'unpaid', order_type: 'dine-in',
            branch_id: table.branchId, waiters: [],
          }]);
          if (orderErr) throw new Error(orderErr.message);
        }

        if (!oid) throw new Error('Could not create or claim order for this table.');
        setOrderId(oid);
        setTable(prev => prev ? { ...prev, status: 'occupied', currentOrderId: oid! } : prev);
      }

      const payload = cartItems.map(item => ({
        id: crypto.randomUUID(),
        order_id: oid, product_id: item.productId, product_name: item.productName,
        quantity: item.quantity, price: item.price, subtotal: item.price * item.quantity,
        status: 'pending', notes: item.notes || null,
        added_by: 'guest', added_by_name: 'Guest', sent_to_kitchen: true,
      }));

      const { error } = await supabase.from('order_items').insert(payload);
      if (error) throw new Error(error.message);

      const { data: allItems } = await supabase.from('order_items').select('*').eq('order_id', oid);
      const subtotal = (allItems || []).reduce((s: number, i: any) => s + Number(i.subtotal), 0);
      await supabase.from('orders').update({ subtotal, total: subtotal }).eq('id', oid);

      // Refresh existing items
      const { data: orderData } = await supabase.from('orders').select('*, order_items(*)').eq('id', oid).single();
      if (orderData) {
        setExistingItems((orderData.order_items || []).map((item: any) => ({
          id: item.id, productId: item.product_id, productName: item.product_name,
          price: Number(item.price), quantity: Number(item.quantity), status: item.status,
        })));
      }

      setCartItems([]);
      setExpandedNotes(null);
      setSuccess(true);
      setTimeout(() => { setSuccess(false); setMobileView('menu'); }, 2500);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to submit order.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#EAEEF3]">
        <div className="flex flex-col items-center gap-5">
          <div className="bg-orange-500 rounded-[28px] p-5 shadow-2xl shadow-orange-200">
            <UtensilsCrossed className="size-10 text-white" />
          </div>
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-black text-gray-400 uppercase tracking-[0.3em]">Loading menu…</p>
        </div>
      </div>
    );
  }

  // ── Invalid table ─────────────────────────────────────────────────────────
  if (invalidTable) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#EAEEF3] px-4">
        <div className="bg-white rounded-[40px] shadow-2xl p-10 max-w-sm w-full text-center">
          <div className="bg-red-100 rounded-full p-4 w-fit mx-auto mb-5">
            <X className="size-10 text-red-500" />
          </div>
          <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight mb-2">Invalid QR Code</h2>
          <p className="text-sm text-gray-400">Please ask a team member for a valid QR code or scan the correct table.</p>
        </div>
      </div>
    );
  }

  // ── Product card (shared by mobile + desktop) ────────────────────────────
  const ProductCard = ({ p, compact = false }: { p: Product; compact?: boolean }) => {
    const isAvailable = (p.kitchenStatus || 'available') === 'available' && (p.availabilityStatus || 'available') === 'available';
    return (
      <div
        onClick={() => isAvailable && addToCart(p)}
        className={`rounded-[20px] shadow-sm transition-all border-2 active:scale-95 flex flex-col ${compact ? 'min-h-[100px]' : 'min-h-[120px]'} ${
          isAvailable ? 'bg-white border-transparent cursor-pointer hover:shadow-md' : 'bg-red-50 border-red-200 cursor-not-allowed opacity-60'
        }`}
      >
        <div className={`${compact ? 'p-3' : 'p-4'} flex flex-col flex-1 justify-between gap-2 relative`}>
          {!isAvailable && (
            <div className="absolute inset-0 flex items-center justify-center z-10 rounded-[20px] bg-red-50/80">
              <span className="bg-red-600 text-white px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-lg">N/A</span>
            </div>
          )}
          <h3 className={`font-bold leading-snug break-words ${compact ? 'text-xs' : 'text-sm'} ${isAvailable ? 'text-gray-800' : 'text-red-400'}`}>{p.name}</h3>
          <div className="mt-auto flex items-center justify-between gap-1">
            <span className={`font-black ${compact ? 'text-sm' : ''} ${isAvailable ? 'text-orange-600' : 'text-red-400'}`}>RM {p.price.toFixed(2)}</span>
            {isAvailable && <div className={`bg-orange-500 text-white rounded-xl ${compact ? 'p-1.5' : 'p-2'}`}><Plus className={compact ? 'size-3.5' : 'size-4'} strokeWidth={4} /></div>}
          </div>
        </div>
      </div>
    );
  };

  // ── Cart item (shared by mobile + desktop) ────────────────────────────────
  const CartItemRow = ({ item, compact = false }: { item: CartItem; compact?: boolean }) => (
    <div className={`bg-orange-50/50 rounded-${compact ? '2xl' : '3xl'} p-${compact ? '4' : '5'} border border-orange-100 shadow-sm space-y-3 animate-in slide-in-from-right-4`}>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h4 className="font-bold text-gray-800 text-sm leading-tight">{item.productName}</h4>
          <p className="text-orange-600 font-black text-xs mt-0.5">RM {item.price.toFixed(2)}</p>
        </div>
        <div className={`flex items-center bg-white border-2 border-orange-100 shadow-sm rounded-${compact ? 'xl p-1 gap-3' : '2xl p-1.5 gap-4'}`}>
          <button
            onClick={() => setCartItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: Math.max(0, i.quantity - 1) } : i).filter(i => i.quantity > 0))}
            className="p-1.5 text-orange-500 hover:bg-orange-50 rounded-lg"
          ><Minus className="size-4" strokeWidth={3} /></button>
          <span className="font-black text-gray-900 w-5 text-center text-sm">{item.quantity}</span>
          <button
            onClick={() => setCartItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i))}
            className="p-1.5 text-orange-500 hover:bg-orange-50 rounded-lg"
          ><Plus className="size-4" strokeWidth={3} /></button>
        </div>
      </div>
      <button
        onClick={() => setExpandedNotes(expandedNotes === item.id ? null : item.id)}
        className="flex items-center gap-1 text-[10px] font-black text-gray-400 uppercase tracking-widest"
      >
        <ChevronDown className={`size-3 transition-transform ${expandedNotes === item.id ? 'rotate-180' : ''}`} />
        {item.notes ? 'Edit kitchen note' : 'Add kitchen note'}
      </button>
      {expandedNotes === item.id && (
        <input
          type="text"
          value={item.notes}
          onChange={e => setCartItems(prev => prev.map(i => i.id === item.id ? { ...i, notes: e.target.value } : i))}
          placeholder="e.g. No onions, extra sauce…"
          className="w-full px-3 py-2 bg-white border border-orange-100 rounded-xl text-xs focus:outline-none focus:border-orange-400"
          autoFocus
        />
      )}
    </div>
  );

  return (
    <div className="flex h-[100dvh] w-full bg-[#EAEEF3] overflow-hidden relative">

      {/* ── SUCCESS OVERLAY ── */}
      {success && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-white/10 backdrop-blur-[2px] animate-in fade-in duration-300">
          <div className="bg-orange-500 text-white px-8 py-8 sm:px-12 sm:py-10 rounded-[40px] shadow-2xl flex flex-col items-center gap-4 border-4 border-white animate-in zoom-in">
            <div className="bg-white rounded-full p-4"><CheckCircle2 className="size-12 sm:size-14 text-orange-500" strokeWidth={3} /></div>
            <div className="text-center font-black uppercase tracking-tighter">
              <h2 className="text-2xl sm:text-3xl leading-none">Order Sent!</h2>
              <p className="text-orange-100 text-xs mt-1">Kitchen is on it</p>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          MOBILE LAYOUT  (hidden on lg+)
      ═══════════════════════════════════════════════════════ */}

      {/* ── MOBILE: MENU PANEL ── */}
      <div className={`lg:hidden absolute inset-0 flex flex-col bg-[#EAEEF3] transition-transform duration-300 ${mobileView === 'menu' ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Top bar */}
        <div className="bg-white px-3 py-2.5 flex items-center gap-2 shadow-sm border-b">
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="bg-orange-500 rounded-xl p-1.5 shadow-sm">
              <UtensilsCrossed className="size-3.5 text-white" />
            </div>
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
            <input
              type="text" placeholder="Search menu…" inputMode="search"
              className="w-full pl-9 pr-3 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none ring-1 ring-gray-200"
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            onClick={handleCallWaiter}
            disabled={callingWaiter || !!table?.needsWaiter}
            className={`flex items-center gap-1 px-3 py-2.5 rounded-xl text-xs font-black shadow-sm whitespace-nowrap transition-all active:scale-95 ${table?.needsWaiter ? 'bg-orange-100 text-orange-600' : 'bg-white border text-gray-700'}`}
          >
            <Bell className="size-3.5 text-orange-500" />
            <span>{table?.needsWaiter ? 'Called' : 'Waiter'}</span>
          </button>
          <div className="text-right border-l pl-2 border-gray-100 shrink-0">
            <p className="text-[9px] font-bold text-orange-500 uppercase tracking-widest leading-none mb-0.5">Table</p>
            <p className="text-xs font-black text-gray-900 leading-none">{table ? `T-${table.number}` : '…'}</p>
          </div>
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
          {filteredProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-300 gap-3">
              <ShoppingBag className="size-12 opacity-20" />
              <span className="text-xs font-black uppercase tracking-widest opacity-40">No items found</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {filteredProducts.map(p => <ProductCard key={p.id} p={p} compact />)}
            </div>
          )}
        </div>

        {/* Category tabs */}
        <div className="bg-white border-t px-2 py-2 flex gap-2 overflow-x-auto no-scrollbar">
          {categories.map(cat => (
            <button
              key={cat.id} onClick={() => setSelectedCategory(cat.id)}
              className={`px-5 py-3 rounded-[16px] font-black whitespace-nowrap transition-all text-[10px] uppercase tracking-widest shadow-sm ${selectedCategory === cat.id ? 'bg-orange-500 text-white shadow-orange-200 -translate-y-0.5' : 'bg-gray-100 text-gray-500'}`}
            >{cat.name}</button>
          ))}
        </div>

        {/* Floating cart FAB */}
        <button
          onClick={() => setMobileView('cart')}
          className="absolute bottom-20 right-4 bg-orange-500 text-white rounded-full shadow-2xl shadow-orange-300 flex items-center gap-2 px-5 py-3.5 font-black text-sm transition-all active:scale-95"
        >
          <ShoppingCart className="size-5" />
          {totalItems > 0 && (
            <span className="bg-white text-orange-500 rounded-full text-xs font-black px-2 py-0.5 leading-none">{totalItems}</span>
          )}
          <span>Order{totalItems > 0 ? ` · RM ${cartTotal.toFixed(2)}` : ''}</span>
        </button>
      </div>

      {/* ── MOBILE: CART PANEL ── */}
      <div className={`lg:hidden absolute inset-0 flex flex-col bg-white transition-transform duration-300 ${mobileView === 'cart' ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Orange header */}
        <div className="bg-orange-500 p-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setMobileView('menu')} className="bg-white/20 text-white p-2 rounded-xl active:bg-white/30 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-white font-black text-sm uppercase tracking-widest flex-1">Your Order</span>
            <span className="text-white font-black italic text-base uppercase opacity-90">Table {table?.number}</span>
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
          {existingItems.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-1 italic">Already Ordered</p>
              {existingItems.map(item => (
                <div key={item.id} className="bg-gray-50/80 rounded-2xl p-4 border border-dashed border-gray-200 flex items-center gap-3 opacity-70">
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-800 text-sm leading-tight">{item.productName}</h4>
                    <p className="text-[10px] font-bold text-gray-400 mt-0.5 uppercase tracking-wider capitalize">{item.status}</p>
                  </div>
                  <div className="bg-gray-200 text-gray-600 px-3 py-1.5 rounded-xl text-[10px] font-black">×{item.quantity}</div>
                  <div className="text-sm font-bold text-gray-500">RM {(item.price * item.quantity).toFixed(2)}</div>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2.5">
            <p className="text-[10px] font-black text-orange-500 uppercase tracking-[0.2em] px-1 italic">New Items</p>
            {cartItems.length === 0
              ? (
                <div className="h-44 border-4 border-dashed border-gray-100 rounded-[32px] flex flex-col items-center justify-center text-gray-300">
                  <ShoppingCart className="size-10 mb-2 opacity-10" />
                  <span className="text-xs font-bold opacity-30 uppercase tracking-widest">Nothing added yet</span>
                </div>
              )
              : cartItems.map(item => <CartItemRow key={item.id} item={item} compact />)
            }
          </div>
        </div>

        {/* Total + CTA */}
        <div className="p-4 border-t bg-gray-50 pb-safe">
          {existingItems.length > 0 && (
            <div className="flex justify-between text-xs text-gray-400 mb-1.5 px-1">
              <span className="font-bold uppercase tracking-widest">Already ordered</span>
              <span className="font-black">RM {existingTotal.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between items-end mb-4">
            <span className="text-gray-400 font-black text-[10px] uppercase tracking-[0.2em] italic">New items total</span>
            <span className="text-2xl font-black text-gray-900 tracking-tighter">RM {cartTotal.toFixed(2)}</span>
          </div>
          <button
            onClick={handleSubmitOrder}
            disabled={submitting || cartItems.length === 0}
            className={`w-full font-black py-4 rounded-[20px] shadow-xl transition-all uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-2 ${cartItems.length > 0 ? 'bg-orange-500 text-white shadow-orange-200 active:scale-[0.98]' : 'bg-gray-200 text-gray-400'}`}
          >
            <ShoppingBag className="size-5" />
            {submitting ? 'Sending…' : cartItems.length > 0 ? 'Send to Kitchen' : 'Add items first'}
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          DESKTOP LAYOUT  (hidden below lg)
      ═══════════════════════════════════════════════════════ */}

      {/* ── DESKTOP: LEFT MENU ── */}
      <div className="hidden lg:flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <div className="bg-white p-4 flex items-center justify-between shadow-sm border-b gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-orange-500 rounded-2xl p-2.5 shadow-sm">
              <UtensilsCrossed className="size-5 text-white" />
            </div>
            <div>
              <p className="font-black text-gray-900 leading-none text-sm uppercase tracking-wide">AL-NAWRAS</p>
              <p className="text-[10px] text-orange-500 font-bold uppercase tracking-widest leading-none mt-0.5">Restaurant</p>
            </div>
          </div>
          <div className="relative w-72 xl:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
            <input
              type="text" placeholder="Search menu…"
              className="w-full pl-10 pr-4 py-3 bg-gray-100 rounded-2xl text-sm focus:outline-none ring-1 ring-gray-200"
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCallWaiter}
              disabled={callingWaiter || !!table?.needsWaiter}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-black shadow-sm transition-all ${table?.needsWaiter ? 'bg-orange-100 text-orange-600' : 'bg-white border text-gray-700 hover:bg-gray-50'}`}
            >
              <Bell className="size-4 text-orange-500" />
              {table?.needsWaiter ? 'Waiter Called' : 'Call Waiter'}
            </button>
            <div className="text-right border-l pl-4 border-gray-100">
              <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest leading-none mb-1">Table</p>
              <p className="text-2xl font-black text-gray-900 leading-none italic">{table ? `T-${table.number}` : '…'}</p>
            </div>
          </div>
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {filteredProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-300 gap-4">
              <ShoppingBag className="size-16 opacity-20" />
              <span className="text-sm font-black uppercase tracking-widest opacity-40">No items found</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
              {filteredProducts.map(p => <ProductCard key={p.id} p={p} />)}
            </div>
          )}
        </div>

        {/* Category tabs */}
        <div className="bg-white border-t p-3 flex gap-2 overflow-x-auto no-scrollbar">
          {categories.map(cat => (
            <button
              key={cat.id} onClick={() => setSelectedCategory(cat.id)}
              className={`px-10 py-5 rounded-[22px] font-black whitespace-nowrap transition-all text-[10px] uppercase tracking-widest shadow-sm ${selectedCategory === cat.id ? 'bg-orange-500 text-white shadow-orange-200 -translate-y-1' : 'bg-gray-100 text-gray-500'}`}
            >{cat.name}</button>
          ))}
        </div>
      </div>

      {/* ── DESKTOP: RIGHT SIDEBAR ── */}
      <aside className="hidden lg:flex w-[380px] xl:w-[400px] bg-white border-l flex-col shadow-2xl z-10">
        <div className="p-5 bg-orange-500">
          <div className="flex items-center justify-between">
            <span className="text-white font-black text-sm uppercase tracking-widest">Your Order</span>
            <span className="text-white font-black italic text-xl uppercase">T-{table?.number}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
          {existingItems.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-2 italic">Already Ordered</p>
              {existingItems.map(item => (
                <div key={item.id} className="bg-gray-50/80 rounded-3xl p-5 border border-dashed border-gray-200 flex items-center gap-4 opacity-70">
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-800 text-sm leading-tight">{item.productName}</h4>
                    <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-wider capitalize">{item.status}</p>
                  </div>
                  <div className="bg-gray-200 text-gray-600 px-3 py-1.5 rounded-xl text-[10px] font-black">×{item.quantity}</div>
                  <div className="text-sm font-bold text-gray-500">RM {(item.price * item.quantity).toFixed(2)}</div>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-3">
            <p className="text-[10px] font-black text-orange-500 uppercase tracking-[0.2em] px-2 italic">New Items</p>
            {cartItems.length === 0
              ? (
                <div className="h-48 border-4 border-dashed border-gray-50 rounded-[40px] flex flex-col items-center justify-center text-gray-300 italic">
                  <ShoppingCart className="size-12 mb-3 opacity-10" />
                  <span className="text-sm font-bold opacity-30 uppercase tracking-widest">Nothing added</span>
                </div>
              )
              : cartItems.map(item => <CartItemRow key={item.id} item={item} />)
            }
          </div>
        </div>

        <div className="p-8 border-t bg-gray-50 space-y-3">
          {existingItems.length > 0 && (
            <div className="flex justify-between text-xs text-gray-400 px-1">
              <span className="font-bold uppercase tracking-widest">Already ordered</span>
              <span className="font-black">RM {existingTotal.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between items-end">
            <span className="text-gray-400 font-black text-[10px] uppercase tracking-[0.2em] italic leading-none">New items total</span>
            <span className="text-3xl font-black text-gray-900 leading-none tracking-tighter">RM {cartTotal.toFixed(2)}</span>
          </div>
          <button
            onClick={handleSubmitOrder}
            disabled={submitting || cartItems.length === 0}
            className={`w-full font-black py-5 rounded-[24px] shadow-2xl transition-all uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 mt-2 ${cartItems.length > 0 ? 'bg-orange-500 text-white hover:scale-[1.02] shadow-orange-200' : 'bg-gray-200 text-gray-400'}`}
          >
            <ShoppingBag className="size-5" />
            {submitting ? 'Sending…' : cartItems.length > 0 ? 'Send to Kitchen' : 'Add items first'}
          </button>
        </div>
      </aside>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #F97316; border-radius: 10px; }
        .pb-safe { padding-bottom: max(1rem, env(safe-area-inset-bottom)); }
      `}</style>
    </div>
  );
}
