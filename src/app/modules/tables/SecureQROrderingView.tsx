import { arrange, MENU_GRID } from '../../components/MenuRows';
/**
 * SecureQROrderingView.tsx
 *
 * Customer-facing ordering page reached via a secure QR code.
 * The URL contains only a random token — the real table ID is never exposed.
 *
 * The page only holds a guest-session token (from guest_join). Everything it
 * reads or changes about the table and the bill goes through the token-checked
 * functions in migration 0029; the server enforces the ordering rules.
 */

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import { Product, Category, ModifierGroup, SelectedModifier } from '../../models/types';
import { ModifierController } from '../../controllers/ModifierController';
import { BranchController } from '../../controllers/BranchController';
import { ModifierPickerModal } from '../../components/ModifierPickerModal';
import { toast } from 'sonner';
import {
  Plus, Minus, ShoppingCart, Search, X,
  CheckCircle2, ShoppingBag, Bell, ChevronDown, UtensilsCrossed, ShieldAlert,
} from 'lucide-react';
import { ProductImage } from '../../components/ProductImage';
import { useBranchProfile } from '../../hooks/useBranchProfile';
import { friendlyError } from '../../../lib/errors';

// ─── Full ordering UI (receives tableId as prop, never from URL) ──────────────

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
  addedByName?: string;
}

interface GuestTable { number: number; branchId: string; orderingEnabled: boolean; needsWaiter: boolean }

const toExisting = (items: any[]): ExistingItem[] => (items ?? []).map((item: any) => ({
  id: item.id, productId: item.product_id, productName: item.product_name,
  price: Number(item.price), quantity: Number(item.quantity), status: item.status,
  addedByName: item.added_by_name,
}));

// shortcut: polls instead of realtime (anon can't see realtime rows once RLS is on); 8s is fine for a menu.
// 30 s keeps a guest's phone current without using the free plan's data allowance
// (8 s used ~2.7 GB/month at 100 tables a day); it also refreshes when the page is reopened.
const POLL_MS = 30_000;

export function SecureOrderingUI({ sessionToken }: { sessionToken: string }) {
  const [table, setTable]                 = useState<GuestTable | null>(null);
  const businessName = useBranchProfile(table?.branchId);
  const [existingItems, setExistingItems] = useState<ExistingItem[]>([]);
  const [products, setProducts]           = useState<Product[]>([]);
  const [categories, setCategories]       = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery]     = useState('');
  const [cartItems, setCartItems]         = useState<CartItem[]>([]);
  const [modifierMap, setModifierMap]     = useState<Record<string, ModifierGroup[]>>({});
  const [picking, setPicking]             = useState<Product | null>(null);
  const [loading, setLoading]             = useState(true);
  const [submitting, setSubmitting]       = useState(false);
  const [success, setSuccess]             = useState(false);
  const [invalidTable, setInvalidTable]   = useState(false);
  const [branchClosed, setBranchClosed]   = useState(false);
  const [callingWaiter, setCallingWaiter] = useState(false);
  const [mobileView, setMobileView]       = useState<'menu' | 'cart'>('menu');
  const [expandedNotes, setExpandedNotes] = useState<string | null>(null);

  // Applies a guest_state() result; null means the party was closed (bill paid) or the token is stale.
  const applyState = (st: any) => {
    if (!st) { setInvalidTable(true); return; }
    setTable({
      number: st.table_number, branchId: st.branch_id,
      orderingEnabled: !!st.ordering_enabled, needsWaiter: !!st.needs_waiter,
    });
    setExistingItems(toExisting(st.items));
    const soldOut = new Set<string>(st.unavailable_product_ids ?? []);
    setProducts(prev => prev.map(p => ({ ...p, kitchenStatus: soldOut.has(p.id) ? 'finished' : 'available' })));
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: st } = await supabase.rpc('guest_state', { p_session_token: sessionToken });
      if (!st) { setInvalidTable(true); setLoading(false); return; }
      const branchId = st.branch_id;

      // Contract expired / branch suspended → customers can't order.
      const access = await BranchController.getAccess(branchId);
      if (!access.allowed) { setBranchClosed(true); setLoading(false); return; }

      const [productsRes, categoriesRes] = await Promise.all([
        supabase.from('products').select('*').eq('branch_id', branchId).eq('is_active', true).order('name'),
        supabase.from('categories').select('*').eq('branch_id', branchId).eq('is_active', true).order('display_order'),
      ]);

      const prods: Product[] = (productsRes.data ?? []).map((p: any) => ({
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
      setModifierMap(await ModifierController.getGroupsForProducts(prods.map(p => p.id)));

      const cats: Category[] = (categoriesRes.data ?? [])
        .map((c: any) => ({
          id: c.id, name: c.name, description: c.description,
          color: c.color ?? '#f97316', icon: c.icon,
          displayOrder: Number(c.display_order ?? 0), isActive: c.is_active ?? true,
          branchId: c.branch_id, createdAt: new Date(c.created_at),
        }))
        .filter((c: Category) => c.isActive);
      setCategories(cats);
      if (cats.length) setSelectedCategory(cats[0].id);

      applyState(st);
      setLoading(false);
    };
    void load();
  }, [sessionToken]);

  // Keep the shared bill, ordering switch, waiter-call state and sold-out dishes current.
  useEffect(() => {
    if (loading || invalidTable || branchClosed) return;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      const { data: st, error } = await supabase.rpc('guest_state', { p_session_token: sessionToken });
      if (!error) applyState(st);
    };
    const t = setInterval(() => { void tick(); }, POLL_MS);
    const onVisible = () => { void tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [sessionToken, loading, invalidTable, branchClosed]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const activeCategory = categories.find(c => c.id === selectedCategory);
    return products.filter(p => {
      if (q) return p.name.toLowerCase().includes(q);
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
      id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      productId: product.id, productName: product.name, price: product.price + extra,
      quantity: 1, station: product.station || 'kitchen', notes: '', modifiers: selected,
    }]);
    setPicking(null);
  };

  const handleCallWaiter = async () => {
    if (!table) return;
    setCallingWaiter(true);
    const { data: ok, error } = await supabase.rpc('guest_call_waiter', { p_session_token: sessionToken });
    if (error || !ok) toast.error('Could not call waiter. Try again.');
    else {
      setTable(prev => prev ? { ...prev, needsWaiter: true } : prev);
      toast.success('Waiter has been notified!');
    }
    setCallingWaiter(false);
  };

  const handleSubmitOrder = async () => {
    if (!table || cartItems.length === 0) { toast.error('Add items to your order first.'); return; }
    setSubmitting(true);
    try {
      const { data: st, error } = await supabase.rpc('guest_submit', {
        p_session_token: sessionToken,
        p_items: cartItems.map(item => ({
          product_id: item.productId, quantity: item.quantity, notes: item.notes || null,
          option_ids: (item.modifiers ?? []).map(m => m.optionId).filter(Boolean),
        })),
      });
      // The server's message is written for customers (e.g. "… is not available right now").
      if (error) { toast.error(friendlyError(error, 'Could not send your order. Please try again.')); return; }
      applyState(st);
      setCartItems([]);
      setExpandedNotes(null);
      setSuccess(true);
      setTimeout(() => { setSuccess(false); setMobileView('menu'); }, 2500);
    } finally {
      setSubmitting(false);
    }
  };

  // Shared by the ordering header and the "ordering locked" screen.
  const callWaiterButton = (
    <button
      onClick={handleCallWaiter}
      disabled={callingWaiter || table?.needsWaiter}
      className={`flex items-center gap-1.5 min-h-11 whitespace-nowrap px-3 py-2 rounded-xl text-xs font-bold transition-all ${
        table?.needsWaiter
          ? 'bg-amber-100 text-amber-700 cursor-default'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-95'
      }`}
    >
      <Bell className="size-3.5" />
      {table?.needsWaiter ? 'Called!' : 'Call Waiter'}
    </button>
  );

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

  if (!table?.orderingEnabled) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#EAEEF3] px-4 py-6">
        <div className="bg-white rounded-[40px] shadow-2xl p-7 sm:p-10 max-w-sm w-full text-center">
          <div className="bg-amber-100 rounded-full p-4 w-fit mx-auto mb-5">
            <Bell className="size-10 text-amber-500" />
          </div>
          <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight mb-2">Ask Your Waiter</h2>
          <p className="text-sm text-gray-400">Ordering isn't open for this table yet — a team member needs to enable it first. This page will unlock automatically once they do.</p>
          <div className="mt-6 flex justify-center">{callWaiterButton}</div>
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    ready:     'bg-emerald-100 text-emerald-700',
    preparing: 'bg-amber-100 text-amber-700',
    pending:   'bg-gray-100 text-gray-600',
    served:    'bg-blue-100 text-blue-700',
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-[#EAEEF3] overflow-hidden">
      {/* Header */}
      <div className="bg-white px-4 pt-safe pb-3 shadow-sm flex items-center justify-between gap-3 flex-shrink-0">
        <div className="min-w-0">
          <h1 className="font-black text-gray-900 text-lg leading-tight whitespace-nowrap">Table {table?.number}</h1>
          <p dir="auto" className="text-[11px] text-gray-500 font-medium truncate">{businessName}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {callWaiterButton}
          {/* On wide screens the order is always visible in the side panel. */}
          <button
            onClick={() => setMobileView(mobileView === 'menu' ? 'cart' : 'menu')}
            aria-label={mobileView === 'menu' ? 'Your Order' : 'Menu'}
            className="lg:hidden relative bg-orange-500 text-white size-11 flex items-center justify-center rounded-xl shadow-lg shadow-orange-200 active:scale-95"
          >
            <ShoppingCart className="size-5" />
            {totalItems > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-black rounded-full size-5 flex items-center justify-center">
                {totalItems}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Lives outside the cart bar, which unmounts in the same update that empties the cart. */}
      {success && (
        <div role="status" className="flex items-center justify-center gap-2 py-3 px-4 bg-emerald-500 text-white text-sm font-black flex-shrink-0 animate-in fade-in">
          <CheckCircle2 className="size-5" /> Order sent! The kitchen has your order.
        </div>
      )}

      {/* Phones/tablets: menu OR order (toggled). lg+: menu with the order as a side panel. */}
      <div className="flex-1 min-h-0 flex">
        <div className={`${mobileView === 'menu' ? 'flex' : 'hidden'} lg:flex flex-1 min-w-0 flex-col`}>
          {/* Search */}
          <div className="px-4 py-3 flex-shrink-0">
            <div className="relative lg:max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search menu…"
                className="w-full pl-9 pr-4 py-2.5 bg-white rounded-xl text-base sm:text-sm border-0 shadow-sm outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
          </div>

          {/* Category tabs: one scrolling row on phones, wrapped and fully visible on wide screens */}
          {!searchQuery && (
            <div className="flex lg:flex-wrap gap-2 px-4 pb-3 overflow-x-auto flex-shrink-0 no-scrollbar">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  dir="auto"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex-shrink-0 min-h-11 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    selectedCategory === cat.id
                      ? 'bg-orange-500 text-white shadow-lg shadow-orange-200'
                      : 'bg-white text-gray-600 hover:bg-orange-50'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}

          {/* Products grid */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4">
            {filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <UtensilsCrossed className="size-10 text-gray-200 mb-3" />
                <p className="text-sm text-gray-400 font-medium">No items found</p>
              </div>
            ) : (
              <div className={`grid ${MENU_GRID} gap-3`}>
                {menu.items.map(p => {
                  const isAvailable =
                    (p.kitchenStatus || 'available') === 'available' &&
                    (p.availabilityStatus || 'available') === 'available';
                  return (
                    <div
                      key={p.id}
                      style={menu.style(p.id)}
                      onClick={() => isAvailable && addToCart(p)}
                      className={`rounded-[20px] shadow-sm border-2 active:scale-95 flex flex-col min-w-0 min-h-[100px] transition-all ${
                        isAvailable
                          ? 'bg-white border-transparent cursor-pointer hover:shadow-md'
                          : 'bg-red-50 border-red-200 cursor-not-allowed opacity-60'
                      }`}
                    >
                      {p.image && <ProductImage src={p.image} name={p.name} className="w-full aspect-[4/3] rounded-t-[18px]" />}
                      <div className="p-3 flex flex-col flex-1 justify-between gap-2 relative">
                        {!isAvailable && (
                          <div className="absolute inset-0 flex items-center justify-center z-10 rounded-[20px] bg-red-50/80">
                            <span className="bg-red-600 text-white px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-lg">N/A</span>
                          </div>
                        )}
                        <h3 dir="auto" className={`font-bold leading-snug break-words line-clamp-3 text-xs sm:text-sm ${isAvailable ? 'text-gray-800' : 'text-red-400'}`}>{p.name}</h3>
                        <div className="mt-auto flex items-center justify-between gap-1">
                          <span className={`font-black text-sm whitespace-nowrap ${isAvailable ? 'text-orange-600' : 'text-red-400'}`}>RM {p.price.toFixed(2)}</span>
                          {isAvailable && <div className="bg-orange-500 text-white rounded-xl p-1.5 shrink-0"><Plus className="size-3.5" strokeWidth={4} /></div>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Phones: sticky bar to the order while browsing */}
          {totalItems > 0 && (
            <div className="lg:hidden px-4 pt-2 pb-safe bg-white border-t flex-shrink-0">
              <button
                onClick={() => setMobileView('cart')}
                className="w-full min-h-12 bg-orange-500 text-white py-3 rounded-2xl font-black text-sm shadow-lg shadow-orange-200 active:scale-95 transition-all flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <ShoppingCart className="size-5 shrink-0" /> Your Order · {totalItems} · RM {cartTotal.toFixed(2)}
              </button>
            </div>
          )}
        </div>

        {/* Order: full view on phones, side panel on lg+ */}
        <div className={`${mobileView === 'cart' ? 'flex' : 'hidden'} lg:flex flex-1 lg:flex-none lg:w-[360px] xl:w-[420px] min-w-0 flex-col lg:bg-white lg:border-l lg:shadow-2xl`}>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-3">
          <h2 className="font-black text-gray-900 text-lg">Your Order</h2>

          {existingItems.length > 0 && (
            <div className="bg-white lg:bg-gray-50 rounded-2xl p-4 space-y-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Table Order · everyone</p>
              {existingItems.map(item => (
                <div key={item.id} className="flex items-center justify-between text-sm gap-2">
                  <span dir="auto" className="text-gray-700 flex-1 min-w-0 break-words">
                    {item.quantity}× {item.productName}
                    {item.addedByName && <em className="text-gray-400 not-italic"> · {item.addedByName}</em>}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${statusColors[item.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {item.status}
                  </span>
                </div>
              ))}
              <div className="border-t pt-2 flex justify-between gap-2 text-xs font-bold text-gray-500">
                <span>Table Total</span><span className="whitespace-nowrap">RM {existingTotal.toFixed(2)}</span>
              </div>
            </div>
          )}

          {cartItems.length === 0 && existingItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ShoppingCart className="size-10 text-gray-200 mb-3" />
              <p className="text-sm text-gray-400 font-medium">Your cart is empty</p>
              <button onClick={() => setMobileView('menu')} className="lg:hidden mt-3 min-h-11 px-3 text-orange-500 text-sm font-bold">Browse Menu →</button>
            </div>
          )}

          {cartItems.map(item => (
            <div key={item.id} className="bg-orange-50/50 rounded-2xl p-3 min-[360px]:p-4 border border-orange-100 shadow-sm space-y-3 animate-in slide-in-from-right-4">
              <div className="flex items-center gap-2 min-[360px]:gap-3">
                <div className="flex-1 min-w-0">
                  <h4 dir="auto" className="font-bold text-gray-800 text-sm break-words">{item.productName}</h4>
                  {!!item.modifiers?.length && (
                    <p dir="auto" className="text-[11px] text-gray-500 break-words">{item.modifiers.map(m => m.optionName).join(', ')}</p>
                  )}
                  <p className="text-orange-600 font-black text-xs mt-0.5 whitespace-nowrap">RM {item.price.toFixed(2)}</p>
                </div>
                <div className="flex items-center shrink-0 bg-white border-2 border-orange-100 shadow-sm rounded-xl p-0.5 gap-0.5">
                  <button
                    onClick={() => setCartItems(prev =>
                      prev.map(i => i.id === item.id ? { ...i, quantity: Math.max(0, i.quantity - 1) } : i)
                        .filter(i => i.quantity > 0)
                    )}
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
                {item.notes ? 'Edit note' : 'Add note'}
              </button>
              {expandedNotes === item.id && (
                <textarea
                  dir="auto"
                  value={item.notes}
                  onChange={e => setCartItems(prev => prev.map(i => i.id === item.id ? { ...i, notes: e.target.value } : i))}
                  placeholder="e.g. No onions, extra spicy…"
                  className="w-full text-base sm:text-xs bg-white border border-orange-200 rounded-xl p-2.5 resize-none outline-none focus:ring-2 focus:ring-orange-300"
                  rows={2}
                />
              )}
            </div>
          ))}
        </div>

        {/* Place order button */}
        {cartItems.length > 0 && (
          <div className="px-4 pb-safe pt-3 bg-white border-t flex-shrink-0">
            <button
              onClick={handleSubmitOrder}
              disabled={submitting}
              className="w-full min-h-12 bg-orange-500 text-white py-4 [@media(max-height:500px)]:py-3 rounded-2xl font-black text-base shadow-xl shadow-orange-200 active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2 whitespace-nowrap"
            >
              {submitting ? (
                <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sending…</>
              ) : (
                <><ShoppingBag className="size-5 shrink-0" /> Place Order · RM {cartTotal.toFixed(2)}</>
              )}
            </button>
          </div>
        )}
        </div>
      </div>

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
