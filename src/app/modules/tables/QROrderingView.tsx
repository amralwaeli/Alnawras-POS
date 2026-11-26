import { arrange, MENU_GRID } from '../../components/MenuRows';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { supabase } from '../../../lib/supabase';
import { Product, Category, Table, ModifierGroup, SelectedModifier } from '../../models/types';
import { ModifierController } from '../../controllers/ModifierController';
import { ModifierPickerModal } from '../../components/ModifierPickerModal';
import { OrderController } from '../../controllers/OrderController';
import { AuthController } from '../../controllers/AuthController';
import { BranchController } from '../../controllers/BranchController';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';
import {
  Plus, Minus, ShoppingCart, X, Search,
  CheckCircle2, ShoppingBag, Bell, ChevronDown, ChevronLeft, UtensilsCrossed, Ban, Trash2,
} from 'lucide-react';
import { ProductImage } from '../../components/ProductImage';
import { friendlyError } from '../../../lib/errors';
import { BUSINESS_NAME } from '../../../lib/branding';

interface CartItem {
  id: string;
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  station: string;
  notes: string;
  modifiers?: SelectedModifier[];
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
  // This legacy route is reached two ways: a customer scanning the printed QR
  // (no session) and a staff member navigating here from TablesView's "Add
  // Items"/"View Menu" buttons while already logged in. The ordering-enabled
  // gate below is about blocking self-service customers, not staff already
  // standing at the table on the restaurant's own device — so it only applies
  // when there's no active staff session in this browser tab.
  const { currentUser } = useAuth();
  const navigate = useNavigate();

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
  const [branchClosed, setBranchClosed] = useState(false);
  const [callingWaiter, setCallingWaiter] = useState(false);
  // Product choices (leg/breast, bread/rice…): products with choices open the picker.
  const [modifierMap, setModifierMap] = useState<Record<string, ModifierGroup[]>>({});
  const [picking, setPicking] = useState<Product | null>(null);
  useEffect(() => {
    if (!products.length) return;
    ModifierController.getGroupsForProducts(products.map(p => p.id)).then(setModifierMap).catch(() => {});
  }, [products]);
  const [mobileView, setMobileView]     = useState<'menu' | 'cart'>('menu');
  const [expandedNotes, setExpandedNotes] = useState<string | null>(null);
  const [voidTarget, setVoidTarget]     = useState<ExistingItem | null>(null);
  const [voidReason, setVoidReason]     = useState('');
  const [voiding, setVoiding]           = useState(false);

  // Voiding an already-sent item is restricted to staff with the elevated
  // permission (e.g. Super Waiter/manager/admin) — never shown to a customer.
  const canVoid = !!currentUser && AuthController.hasPermission(currentUser, 'canVoidSentItems');

  const handleVoidConfirm = async () => {
    if (!voidTarget || !currentUser || !orderId) return;
    setVoiding(true);
    const res = await OrderController.voidItem(
      voidTarget.id, orderId, voidReason.trim() || undefined,
      { id: currentUser.id, name: currentUser.name },
      currentUser.branchId,
    );
    setVoiding(false);
    if (res.success) {
      setExistingItems(prev => prev.filter(i => i.id !== voidTarget.id));
      toast.success('Item voided — the kitchen has been notified');
      setVoidTarget(null);
      setVoidReason('');
    } else {
      toast.error(friendlyError(res.error, 'Failed to void item'));
    }
  };

  // ── Load table, products, categories, open order ──────────────────────────
  useEffect(() => {
    const load = async () => {
      if (!tableId) { setInvalidTable(true); setLoading(false); return; }
      setLoading(true);

      const { data: tableRow, error } = await supabase
        .from('tables').select('*').eq('id', tableId).single();
      if (error || !tableRow) { setInvalidTable(true); setLoading(false); return; }

      const branchId = tableRow.branch_id;

      // Contract expired / branch suspended → customers can't order. Staff
      // reaching this route while logged in means the branch is open, so only
      // gate the customer (no session) case.
      if (!currentUser) {
        const access = await BranchController.getAccess(branchId);
        if (!access.allowed) { setBranchClosed(true); setLoading(false); return; }
      }

      setTable({
        id: tableRow.id, number: tableRow.number, capacity: tableRow.capacity,
        status: tableRow.status, branchId, currentOrderId: tableRow.current_order_id,
        assignedCashierId: tableRow.assigned_cashier_id,
        needsWaiter: tableRow.needs_waiter ?? false,
        orderingEnabled: tableRow.ordering_enabled ?? false,
      });

      const [productsRes, categoriesRes] = await Promise.all([
        supabase.from('products').select('*').eq('branch_id', branchId).eq('is_active', true).order('name'),
        supabase.from('categories').select('*').eq('branch_id', branchId).eq('is_active', true).order('display_order'),
      ]);

      const prods: Product[] = (productsRes.data || []).map((p: any) => ({
        id: p.id, name: p.name, category: p.category ?? '', categoryId: p.category_id,
        price: Number(p.price), stock: p.stock ?? 0, image: p.image,
        sku: p.sku, taxRate: Number(p.tax_rate ?? 0), reorderPoint: p.reorder_point ?? 0, trackStock: p.track_stock ?? false,
        branchId: p.branch_id, station: p.station ?? 'kitchen',
        kitchenStatus: p.kitchen_status ?? 'available',
        availabilityStatus: p.availability_status ?? 'available',
        isActive: p.is_active ?? true, createdAt: new Date(p.created_at),
        menuRow: p.menu_row ?? 0, menuPos: p.menu_pos ?? 0,
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

  // ── Realtime: react live if a waiter turns ordering on/off for this table ──
  useEffect(() => {
    if (!tableId) return;
    const channel = supabase
      .channel(`qr-table-${tableId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tables', filter: `id=eq.${tableId}` }, (payload) => {
        const up = payload.new as any;
        setTable(prev => prev ? { ...prev, orderingEnabled: up.ordering_enabled ?? false } : prev);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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
  const menu = useMemo(() => arrange(filteredProducts, !!searchQuery.trim()), [filteredProducts, searchQuery]);

  const totalItems    = cartItems.reduce((s, i) => s + i.quantity, 0);
  const cartTotal     = cartItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const existingTotal = existingItems.reduce((s, i) => s + i.price * i.quantity, 0);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const addToCart = (product: Product) => {
    if (modifierMap[product.id]?.length) { setPicking(product); return; }
    setCartItems(prev => {
      const ex = prev.find(i => i.productId === product.id && !i.modifiers?.length);
      if (ex) return prev.map(i => i.id === ex.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, {
        id: `new-${Date.now()}`, productId: product.id, productName: product.name,
        price: product.price, quantity: 1, station: product.station || 'kitchen', notes: '',
      }];
    });
  };

  const addWithModifiers = (product: Product, selected: SelectedModifier[], extra: number) => {
    setCartItems(prev => [...prev, {
      id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, productId: product.id, productName: product.name,
      price: product.price + extra, quantity: 1, station: product.station || 'kitchen', notes: '', modifiers: selected,
    }]);
    setPicking(null);
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
      const result = await OrderController.submitOrder({
        branchId: table.branchId,
        orderType: 'dine-in',
        table: { id: table.id, number: table.number },
        existingOrderId: orderId || table.currentOrderId,
        items: cartItems.map(item => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          price: item.price,
          notes: item.notes,
          station: item.station,
          modifiers: item.modifiers,
        })),
        // Staff taking the order at the table are recorded by name; a scanning guest as Guest.
        addedBy: currentUser?.id ?? 'guest',
        addedByName: currentUser?.name ?? 'Guest',
      });

      if (!result.success) {
        toast.error(friendlyError(result.error));
        return;
      }

      setOrderId(result.data.id);
      setTable(prev => prev ? { ...prev, status: 'occupied', currentOrderId: result.data.id } : prev);
      setExistingItems(result.data.items.map(item => ({
        id: item.id, productId: item.productId, productName: item.productName,
        price: item.price, quantity: item.quantity, status: item.status,
      })));

      setCartItems([]);
      setExpandedNotes(null);
      setSuccess(true);
      setTimeout(() => { setSuccess(false); setMobileView('menu'); }, 2500);
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
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#EAEEF3] px-4 py-6">
        <div className="bg-white rounded-[40px] shadow-2xl p-7 sm:p-10 max-w-sm w-full text-center">
          <div className="bg-red-100 rounded-full p-4 w-fit mx-auto mb-5">
            <X className="size-10 text-red-500" />
          </div>
          <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight mb-2">Invalid QR Code</h2>
          <p className="text-sm text-gray-400">Please ask a team member for a valid QR code or scan the correct table.</p>
        </div>
      </div>
    );
  }

  // ── Branch closed (contract expired / suspended) ──────────────────────────
  if (branchClosed) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#EAEEF3] px-4 py-6">
        <div className="bg-white rounded-[40px] shadow-2xl p-7 sm:p-10 max-w-sm w-full text-center">
          <div className="bg-gray-100 rounded-full p-4 w-fit mx-auto mb-5">
            <UtensilsCrossed className="size-10 text-gray-400" />
          </div>
          <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight mb-2">Temporarily Unavailable</h2>
          <p className="text-sm text-gray-400">Online ordering is currently unavailable for this restaurant. Please ask a team member for assistance.</p>
        </div>
      </div>
    );
  }

  // ── Ordering not yet enabled for this table (customers only — staff using
  //    this route from inside the app while logged in are never blocked) ──
  if (!currentUser && !table?.orderingEnabled) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#EAEEF3] px-4 py-6">
        <div className="bg-white rounded-[40px] shadow-2xl p-7 sm:p-10 max-w-sm w-full text-center">
          <div className="bg-amber-100 rounded-full p-4 w-fit mx-auto mb-5">
            <Bell className="size-10 text-amber-500" />
          </div>
          <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight mb-2">Ask Your Waiter</h2>
          <p className="text-sm text-gray-400">Ordering isn't open for this table yet — a team member needs to enable it first. This page will unlock automatically once they do.</p>
        </div>
      </div>
    );
  }

  // ── Product card (shared by mobile + desktop) ────────────────────────────
  // Called as plain functions, not <ProductCard/>: a component declared inside render remounts on every
  // keystroke/tap, which reloads images and drops the note input's focus (keyboard flicker on phones).
  const productCard = (p: Product, compact = false) => {
    const isAvailable = (p.kitchenStatus || 'available') === 'available' && (p.availabilityStatus || 'available') === 'available';
    return (
      <div
        key={p.id}
        style={menu.style(p.id)}
        onClick={() => isAvailable && addToCart(p)}
        className={`rounded-[20px] shadow-sm transition-all border-2 active:scale-95 flex flex-col min-w-0 ${compact ? 'min-h-[100px]' : 'min-h-[120px]'} ${
          isAvailable ? 'bg-white border-transparent cursor-pointer hover:shadow-md' : 'bg-red-50 border-red-200 cursor-not-allowed opacity-60'
        }`}
      >
        {p.image && <ProductImage src={p.image} name={p.name} className="w-full aspect-[4/3] rounded-t-[18px]" />}
        <div className={`${compact ? 'p-3' : 'p-4'} flex flex-col flex-1 justify-between gap-2 relative`}>
          {!isAvailable && (
            <div className="absolute inset-0 flex items-center justify-center z-10 rounded-[20px] bg-red-50/80">
              <span className="bg-red-600 text-white px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-lg">N/A</span>
            </div>
          )}
          <h3 dir="auto" className={`font-bold leading-snug break-words line-clamp-3 text-sm ${isAvailable ? 'text-gray-800' : 'text-red-400'}`}>{p.name}</h3>
          <div className="mt-auto flex items-center justify-between gap-1">
            <span className={`font-black whitespace-nowrap ${compact ? 'text-sm' : ''} ${isAvailable ? 'text-orange-600' : 'text-red-400'}`}>RM {p.price.toFixed(2)}</span>
            {isAvailable && <div className={`bg-orange-500 text-white rounded-xl shrink-0 ${compact ? 'p-1.5' : 'p-2'}`}><Plus className={compact ? 'size-3.5' : 'size-4'} strokeWidth={4} /></div>}
          </div>
        </div>
      </div>
    );
  };

  // ── Cart item (shared by mobile + desktop) ────────────────────────────────
  const cartItemRow = (item: CartItem, compact = false) => (
    <div key={item.id} className={`bg-orange-50/50 border border-orange-100 shadow-sm space-y-3 animate-in slide-in-from-right-4 ${compact ? 'rounded-2xl p-3 min-[360px]:p-4' : 'rounded-3xl p-4 xl:p-5'}`}>
      <div className="flex items-center gap-2 min-[360px]:gap-3">
        <div className="flex-1 min-w-0">
          <h4 dir="auto" className="font-bold text-gray-800 text-sm leading-tight break-words">{item.productName}</h4>
          {!!item.modifiers?.length && <p dir="auto" className="text-[11px] text-gray-500 break-words">{item.modifiers.map(m => m.optionName).join(', ')}</p>}
          <p className="text-orange-600 font-black text-xs mt-0.5 whitespace-nowrap">RM {item.price.toFixed(2)}</p>
        </div>
        <button onClick={() => setCartItems(prev => prev.filter(i => i.id !== item.id))} aria-label="Remove item" title="Remove (not sent)" className="size-11 shrink-0 flex items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-100"><Trash2 className="size-4" /></button>
        <div className={`flex items-center shrink-0 bg-white border-2 border-orange-100 shadow-sm p-0.5 gap-0.5 ${compact ? 'rounded-xl' : 'rounded-2xl'}`}>
          <button
            onClick={() => setCartItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: Math.max(0, i.quantity - 1) } : i).filter(i => i.quantity > 0))}
            aria-label="Decrease quantity"
            className="size-11 flex items-center justify-center text-orange-500 hover:bg-orange-50 rounded-lg"
          ><Minus className="size-4" strokeWidth={3} /></button>
          <span className="font-black text-gray-900 min-w-5 text-center text-sm">{item.quantity}</span>
          <button
            onClick={() => setCartItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i))}
            aria-label="Increase quantity"
            className="size-11 flex items-center justify-center text-orange-500 hover:bg-orange-50 rounded-lg"
          ><Plus className="size-4" strokeWidth={3} /></button>
        </div>
      </div>
      <button
        onClick={() => setExpandedNotes(expandedNotes === item.id ? null : item.id)}
        className="flex items-center gap-1 min-h-9 text-[10px] font-black text-gray-400 uppercase tracking-widest"
      >
        <ChevronDown className={`size-3 transition-transform ${expandedNotes === item.id ? 'rotate-180' : ''}`} />
        {item.notes ? 'Edit kitchen note' : 'Add kitchen note'}
      </button>
      {expandedNotes === item.id && (
        <input
          type="text"
          dir="auto"
          value={item.notes}
          onChange={e => setCartItems(prev => prev.map(i => i.id === item.id ? { ...i, notes: e.target.value } : i))}
          placeholder="e.g. No onions, extra sauce…"
          className="w-full px-3 py-2 bg-white border border-orange-100 rounded-xl text-base sm:text-xs focus:outline-none focus:border-orange-400"
          autoFocus
        />
      )}
    </div>
  );

  return (
    <div className="flex h-[100dvh] w-full bg-[#EAEEF3] overflow-hidden relative">

      {/* ── VOID ITEM CONFIRM (staff only) ── */}
      {voidTarget && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 p-4" onClick={() => !voiding && setVoidTarget(null)}>
          <div className="bg-white rounded-[32px] shadow-2xl p-5 sm:p-6 w-full max-w-sm max-h-[90dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-red-100 rounded-full p-3 w-fit mx-auto mb-4">
              <Ban className="size-7 text-red-500" />
            </div>
            <h2 className="text-lg font-black text-gray-900 text-center mb-1">Void this item?</h2>
            <p className="text-sm text-gray-500 text-center mb-4 break-words">
              "{voidTarget.productName}" will be removed from the bill and the kitchen will be notified it was cancelled.
            </p>
            <input
              type="text" value={voidReason} onChange={e => setVoidReason(e.target.value)}
              placeholder="Reason (optional)"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm mb-4 focus:outline-none focus:border-red-300"
            />
            <div className="flex gap-3">
              <button onClick={() => setVoidTarget(null)} disabled={voiding} className="flex-1 min-h-11 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm">Cancel</button>
              <button onClick={handleVoidConfirm} disabled={voiding} className="flex-1 min-h-11 py-3 rounded-2xl bg-red-600 text-white font-bold text-sm disabled:opacity-60">
                {voiding ? 'Voiding…' : 'Void Item'}
              </button>
            </div>
          </div>
        </div>
      )}

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
        <div className="bg-white px-3 pt-safe pb-2.5 flex items-center gap-2 shadow-sm border-b shrink-0">
          <div className="hidden min-[360px]:flex items-center gap-1.5 shrink-0">
            <div className="bg-orange-500 rounded-xl p-1.5 shadow-sm">
              <UtensilsCrossed className="size-3.5 text-white" />
            </div>
          </div>
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
            <input
              type="text" placeholder="Search menu…" inputMode="search"
              className="w-full pl-9 pr-3 py-2.5 bg-gray-100 rounded-xl text-base sm:text-sm focus:outline-none ring-1 ring-gray-200"
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          {currentUser ? (
            <button onClick={() => navigate('/tables')} aria-label="Back to tables"
              className="flex items-center gap-1 min-h-11 shrink-0 px-3 py-2.5 rounded-xl text-sm font-bold bg-white border text-gray-700 shadow-sm whitespace-nowrap active:scale-95">
              <ChevronLeft className="size-4" /> Tables
            </button>
          ) : (
          <button
            onClick={handleCallWaiter}
            disabled={callingWaiter || !!table?.needsWaiter}
            className={`flex items-center gap-1 min-h-11 shrink-0 px-3 py-2.5 rounded-xl text-xs font-black shadow-sm whitespace-nowrap transition-all active:scale-95 ${table?.needsWaiter ? 'bg-orange-100 text-orange-600' : 'bg-white border text-gray-700'}`}
          >
            <Bell className="size-3.5 text-orange-500" />
            <span>{table?.needsWaiter ? 'Called' : 'Waiter'}</span>
          </button>
          )}
          <div className="text-right border-l pl-2 border-gray-100 shrink-0">
            <p className="text-[9px] font-bold text-orange-500 uppercase tracking-widest leading-none mb-0.5">Table</p>
            <p className="text-xs font-black text-gray-900 leading-none whitespace-nowrap">{table ? `T-${table.number}` : '…'}</p>
          </div>
        </div>

        {/* Product grid (bottom padding keeps the last row clear of the order button) */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 pb-24 custom-scrollbar">
          {filteredProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-300 gap-3">
              <ShoppingBag className="size-12 opacity-20" />
              <span className="text-xs font-black uppercase tracking-widest opacity-40">No items found</span>
            </div>
          ) : (
            <div className={`grid ${MENU_GRID} gap-2.5`}>
              {menu.items.map(p => productCard(p, true))}
            </div>
          )}
        </div>

        {/* Category tabs */}
        <div className="bg-white border-t px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex gap-2 overflow-x-auto no-scrollbar shrink-0">
          {categories.map(cat => (
            <button
              key={cat.id} dir="auto" onClick={() => setSelectedCategory(cat.id)}
              className={`shrink-0 min-h-11 px-5 py-3 rounded-[16px] font-bold whitespace-nowrap transition-all text-sm shadow-sm ${selectedCategory === cat.id ? 'bg-orange-500 text-white shadow-orange-200 -translate-y-0.5' : 'bg-gray-100 text-gray-500'}`}
            >{cat.name}</button>
          ))}
        </div>

        {/* Floating cart FAB */}
        <button
          onClick={() => setMobileView('cart')}
          className="absolute bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 max-w-[calc(100%-2rem)] whitespace-nowrap bg-orange-500 text-white rounded-full shadow-2xl shadow-orange-300 flex items-center gap-2 px-5 py-3.5 font-black text-sm transition-all active:scale-95"
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
        <div className="bg-orange-500 px-3 pt-safe pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={() => setMobileView('menu')} aria-label="Back to menu" className="bg-white/20 text-white size-11 shrink-0 flex items-center justify-center rounded-xl active:bg-white/30 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-white font-black text-sm uppercase tracking-widest flex-1 min-w-0">Your Order</span>
            <span className="text-white font-black italic text-base uppercase opacity-90 whitespace-nowrap">Table {table?.number}</span>
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5 custom-scrollbar">
          {existingItems.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-1 italic">Already Ordered</p>
              {existingItems.map(item => (
                <div key={item.id} className="bg-gray-50/80 rounded-2xl p-3 min-[360px]:p-4 border border-dashed border-gray-200 flex items-center gap-2 min-[360px]:gap-3 opacity-70">
                  <div className="flex-1 min-w-0">
                    <h4 dir="auto" className="font-bold text-gray-800 text-sm leading-tight break-words">{item.productName}</h4>
                    <p className="text-[10px] font-bold text-gray-400 mt-0.5 uppercase tracking-wider capitalize">{item.status}</p>
                  </div>
                  <div className="bg-gray-200 text-gray-600 px-2.5 py-1.5 rounded-xl text-[10px] font-black shrink-0">×{item.quantity}</div>
                  <div className="text-sm font-bold text-gray-500 whitespace-nowrap shrink-0">RM {(item.price * item.quantity).toFixed(2)}</div>
                  {canVoid && (
                    <button onClick={() => setVoidTarget(item)} aria-label="Void item" className="size-11 shrink-0 flex items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors" title="Void item">
                      <Ban className="size-3.5" />
                    </button>
                  )}
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
              : cartItems.map(item => cartItemRow(item, true))
            }
          </div>
        </div>

        {/* Total + CTA */}
        <div className="p-4 border-t bg-gray-50 pb-safe shrink-0 [@media(max-height:500px)]:pt-2">
          {existingItems.length > 0 && (
            <div className="flex justify-between gap-2 text-xs text-gray-400 mb-1.5 px-1">
              <span className="font-bold uppercase tracking-widest">Already ordered</span>
              <span className="font-black whitespace-nowrap">RM {existingTotal.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between items-end gap-2 mb-4 [@media(max-height:500px)]:mb-2">
            <span className="text-gray-400 font-black text-[10px] uppercase tracking-[0.2em] italic">New items total</span>
            <span className="text-2xl font-black text-gray-900 tracking-tighter whitespace-nowrap">RM {cartTotal.toFixed(2)}</span>
          </div>
          <button
            onClick={handleSubmitOrder}
            disabled={submitting || cartItems.length === 0}
            className={`w-full font-black py-4 [@media(max-height:500px)]:py-3 rounded-[20px] shadow-xl transition-all uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-2 ${cartItems.length > 0 ? 'bg-orange-500 text-white shadow-orange-200 active:scale-[0.98]' : 'bg-gray-200 text-gray-400'}`}
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
        <div className="bg-white p-4 flex items-center justify-between shadow-sm border-b gap-4 shrink-0">
          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-orange-500 rounded-2xl p-2.5 shadow-sm">
              <UtensilsCrossed className="size-5 text-white" />
            </div>
            <div>
              <p className="font-black text-gray-900 leading-none text-sm uppercase tracking-wide truncate max-w-40" dir="auto">{BUSINESS_NAME}</p>
              <p className="text-[10px] text-orange-500 font-bold uppercase tracking-widest leading-none mt-0.5">Restaurant</p>
            </div>
          </div>
          <div className="relative flex-1 min-w-0 max-w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
            <input
              type="text" placeholder="Search menu…"
              className="w-full pl-10 pr-4 py-3 bg-gray-100 rounded-2xl text-sm focus:outline-none ring-1 ring-gray-200"
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {currentUser ? (
              <button onClick={() => navigate('/tables')}
                className="flex items-center gap-2 min-h-11 whitespace-nowrap px-5 py-2.5 rounded-2xl text-sm font-bold bg-white border text-gray-700 shadow-sm hover:bg-gray-50">
                <ChevronLeft className="size-4" /> Back to Tables
              </button>
            ) : (
            <button
              onClick={handleCallWaiter}
              disabled={callingWaiter || !!table?.needsWaiter}
              className={`flex items-center gap-2 min-h-11 whitespace-nowrap px-5 py-2.5 rounded-2xl text-sm font-black shadow-sm transition-all ${table?.needsWaiter ? 'bg-orange-100 text-orange-600' : 'bg-white border text-gray-700 hover:bg-gray-50'}`}
            >
              <Bell className="size-4 text-orange-500" />
              {table?.needsWaiter ? 'Waiter Called' : 'Call Waiter'}
            </button>
            )}
            <div className="text-right border-l pl-4 border-gray-100">
              <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest leading-none mb-1">Table</p>
              <p className="text-2xl font-black text-gray-900 leading-none italic whitespace-nowrap">{table ? `T-${table.number}` : '…'}</p>
            </div>
          </div>
        </div>

        {/* Product grid */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
          {filteredProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-300 gap-4">
              <ShoppingBag className="size-16 opacity-20" />
              <span className="text-sm font-black uppercase tracking-widest opacity-40">No items found</span>
            </div>
          ) : (
            <div className={`grid ${MENU_GRID} gap-3`}>
              {menu.items.map(p => productCard(p))}
            </div>
          )}
        </div>

        {/* Category tabs */}
        <div className="bg-white border-t p-3 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
          {categories.map(cat => (
            <button
              key={cat.id} dir="auto" onClick={() => setSelectedCategory(cat.id)}
              className={`shrink-0 px-6 xl:px-10 py-5 [@media(max-height:700px)]:py-3.5 rounded-[22px] font-bold whitespace-nowrap transition-all text-sm shadow-sm ${selectedCategory === cat.id ? 'bg-orange-500 text-white shadow-orange-200 -translate-y-1' : 'bg-gray-100 text-gray-500'}`}
            >{cat.name}</button>
          ))}
        </div>
      </div>

      {/* ── DESKTOP: RIGHT SIDEBAR ── */}
      <aside className="hidden lg:flex w-[340px] xl:w-[400px] shrink-0 min-h-0 bg-white border-l flex-col shadow-2xl z-10">
        <div className="p-5 bg-orange-500 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-white font-black text-sm uppercase tracking-widest">Your Order</span>
            <span className="text-white font-black italic text-xl uppercase whitespace-nowrap">T-{table?.number}</span>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-6 custom-scrollbar">
          {existingItems.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-2 italic">Already Ordered</p>
              {existingItems.map(item => (
                <div key={item.id} className="bg-gray-50/80 rounded-3xl p-4 xl:p-5 border border-dashed border-gray-200 flex items-center gap-3 opacity-70">
                  <div className="flex-1 min-w-0">
                    <h4 dir="auto" className="font-bold text-gray-800 text-sm leading-tight break-words">{item.productName}</h4>
                    <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-wider capitalize">{item.status}</p>
                  </div>
                  <div className="bg-gray-200 text-gray-600 px-3 py-1.5 rounded-xl text-[10px] font-black shrink-0">×{item.quantity}</div>
                  <div className="text-sm font-bold text-gray-500 whitespace-nowrap shrink-0">RM {(item.price * item.quantity).toFixed(2)}</div>
                  {canVoid && (
                    <button onClick={() => setVoidTarget(item)} aria-label="Void item" className="size-11 shrink-0 flex items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors" title="Void item">
                      <Ban className="size-4" />
                    </button>
                  )}
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
              : cartItems.map(item => cartItemRow(item))
            }
          </div>
        </div>

        <div className="p-5 xl:p-8 border-t bg-gray-50 space-y-3 shrink-0">
          {existingItems.length > 0 && (
            <div className="flex justify-between gap-2 text-xs text-gray-400 px-1">
              <span className="font-bold uppercase tracking-widest">Already ordered</span>
              <span className="font-black whitespace-nowrap">RM {existingTotal.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between items-end gap-2">
            <span className="text-gray-400 font-black text-[10px] uppercase tracking-[0.2em] italic leading-none">New items total</span>
            <span className="text-3xl font-black text-gray-900 leading-none tracking-tighter whitespace-nowrap">RM {cartTotal.toFixed(2)}</span>
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
      {picking && (
        <ModifierPickerModal
          productName={picking.name}
          groups={modifierMap[picking.id] ?? []}
          onConfirm={(sel, extra) => addWithModifiers(picking, sel, extra)}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}
