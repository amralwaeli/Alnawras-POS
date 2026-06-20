import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { usePOS } from '../../context/POSContext';
import { OrderController } from '../../controllers/OrderController';
import {
  Plus, Minus, ShoppingCart, Layers, X,
  Search, CheckCircle2, ShoppingBag, Utensils, ArrowLeft,
  FileText, Receipt, ChevronDown, Package, Copy, Check
} from 'lucide-react';
import { createPickupToken } from '../../services/PickupService';
import { Product, ROLE_PERMISSIONS } from '../../models/types';
import { toast } from 'sonner';

interface CartItem {
  id: string;
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  station: 'kitchen' | 'juice' | 'none';
  source: 'existing' | 'new';
  status?: string;
}

// ─── Super-Waiter Options menu ──────────────────────────────────────────────
// Shown only for the 'swaiter' role inside the ordering screen, giving quick
// access to create an Invoice, a Quotation, or a secure customer Pickup link.
function SwaiterOptions({ compact = false, user }: { compact?: boolean; user?: any }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pickupLink, setPickupLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const triggerClass = compact
    ? 'flex items-center gap-1.5 bg-orange-500 text-white px-3 py-2.5 rounded-xl text-xs font-black shadow-sm whitespace-nowrap'
    : 'flex items-center gap-2 bg-orange-500 text-white px-5 py-2.5 rounded-2xl text-sm font-black shadow-sm hover:bg-orange-600 transition-all';

  const handleCreatePickup = async () => {
    if (!user?.branchId) { toast.error('No branch found for this account'); return; }
    setOpen(false);
    setGenerating(true);
    const res = await createPickupToken(user.branchId, user.id, user.name);
    setGenerating(false);
    if ('error' in res) { toast.error('Could not create pickup link'); return; }
    setPickupLink(res.url);
    setCopied(false);
  };

  const copyLink = async () => {
    if (!pickupLink) return;
    try { await navigator.clipboard.writeText(pickupLink); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { toast.error('Copy failed — long-press to copy'); }
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)} disabled={generating} className={triggerClass}>
        <Plus className={compact ? 'size-3.5' : 'size-4'} /> {generating ? 'Creating…' : 'Options'}
        <ChevronDown className={compact ? 'size-3' : 'size-3.5'} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 mt-2 w-60 bg-white rounded-2xl shadow-2xl border border-gray-100 z-40 overflow-hidden">
            <p className="px-4 pt-3 pb-1 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Create New</p>
            <button onClick={handleCreatePickup} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-orange-50 text-left">
              <Package className="size-4 text-orange-500 shrink-0" /> Create Pickup Link
            </button>
            <button onClick={() => { setOpen(false); navigate('/pickup-orders'); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-orange-50 border-t border-gray-50 text-left">
              <Package className="size-4 text-orange-500 shrink-0" /> Pickup Orders Board
            </button>
            <button onClick={() => { setOpen(false); navigate('/invoices'); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-orange-50 border-t border-gray-50 text-left">
              <Receipt className="size-4 text-orange-500 shrink-0" /> Invoice
            </button>
            <button onClick={() => { setOpen(false); navigate('/quotations'); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-orange-50 border-t border-gray-50 text-left">
              <FileText className="size-4 text-orange-500 shrink-0" /> Quotation
            </button>
          </div>
        </>
      )}

      {/* Generated pickup link modal */}
      {pickupLink && (
        <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4" onClick={() => setPickupLink(null)}>
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2"><Package className="size-5 text-orange-500" /> Pickup Link Ready</h3>
              <button onClick={() => setPickupLink(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="size-5 text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-3">Send this secure link to the customer. It is single-use and expires after the order is collected.</p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-700 break-all mb-4">{pickupLink}</div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={copyLink} className="flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-900 text-white font-bold text-sm">
                {copied ? <><Check className="size-4" /> Copied</> : <><Copy className="size-4" /> Copy</>}
              </button>
              <a href={`https://wa.me/?text=${encodeURIComponent('Order for pickup here: ' + pickupLink)}`} target="_blank" rel="noopener"
                className="flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 text-white font-bold text-sm">
                <ShoppingBag className="size-4" /> WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function CustomerMenuView({ takeawayOnly = false }: { takeawayOnly?: boolean } = {}) {
  const navigate = useNavigate();
  const {
    products,
    categories: menuCategories,
    tables,
    orders,
    currentUser,
    refreshData
  } = usePOS();

  // ─── DASHBOARD STATE ────────────────────────────────────────────────────────
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showTableOverlay, setShowTableOverlay] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<'dine-in' | 'takeaway'>(takeawayOnly ? 'takeaway' : 'dine-in');
  const [isSending, setIsSending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [mobileView, setMobileView] = useState<'menu' | 'cart'>('menu');

  // ─── EFFECTS ───────────────────────────────────────────────────────────────
  
  // Sync Bill History when an active table is selected
  useEffect(() => {
    if (!selectedTableId) {
      setCartItems(prev => prev.filter(i => i.source === 'new')); // Keep only un-sent items
      return;
    }
    const table = tables.find(t => t.id === selectedTableId);
    if (!table || !table.currentOrderId) return;

    const order = orders.find(o => o.id === table.currentOrderId);
    if (!order) return;

    const existingItems: CartItem[] = order.items.map(item => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      price: item.price,
      quantity: item.quantity,
      station: item.station as any,
      source: 'existing',
      status: item.status,
    }));

    setCartItems(prev => [...existingItems, ...prev.filter(i => i.source === 'new')]);
  }, [selectedTableId, orders, tables]);

  useEffect(() => {
    if (!menuCategories.length) {
      setSelectedCategory('');
      return;
    }

    const sorted = [...menuCategories].sort((a, b) => a.displayOrder - b.displayOrder);
    const hasSelectedCategory = sorted.some(category => category.id === selectedCategory);
    if (!hasSelectedCategory) {
      setSelectedCategory(sorted[0].id);
    }
  }, [menuCategories, selectedCategory]);

  if (!currentUser) return null;

  // ─── COMPUTED ───────────────────────────────────────────────────────────────
  const activeTables = useMemo(() => tables.filter(t => t.currentOrderId || t.status === 'occupied'), [tables]);
  const availableTables = useMemo(() => tables.filter(t => t.status === 'available'), [tables]);

  const sortedCategories = useMemo(
    () => [...menuCategories].filter(c => c.isActive).sort((a, b) => a.displayOrder - b.displayOrder),
    [menuCategories]
  );

  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const activeCategory = sortedCategories.find(category => category.id === selectedCategory);
    return products.filter(p => {
      if (!p.isActive) return false;
      // When searching, scan all products regardless of selected tab
      if (q) return p.name.toLowerCase().includes(q);
      // Otherwise filter by selected category tab
      return selectedCategory
        ? p.categoryId === selectedCategory ||
          (!!activeCategory && p.category?.toLowerCase() === activeCategory.name.toLowerCase())
        : false;
    });
  }, [products, sortedCategories, selectedCategory, searchQuery]);

  const selectedTable = tables.find(t => t.id === selectedTableId);
  const newItemsOnly = cartItems.filter(i => i.source === 'new');
  const existingItemsOnly = cartItems.filter(i => i.source === 'existing');
  const cartTotal = cartItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);

  // ─── HANDLERS ───────────────────────────────────────────────────────────────
  const addToCart = (product: Product) => {
    setCartItems(prev => {
      const existingNew = prev.find(i => i.productId === product.id && i.source === 'new');
      if (existingNew) return prev.map(i => i.id === existingNew.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { id: `new-${Date.now()}`, productId: product.id, productName: product.name, price: product.price, quantity: 1, station: (product.station as any) || 'kitchen', source: 'new' }];
    });
  };

  const handleSendToKitchen = async (targetTableId?: string) => {
    const finalTableId = targetTableId || selectedTableId;
    if (orderType === 'dine-in' && !finalTableId) { setShowTableModal(true); return; }
    if (newItemsOnly.length === 0) return;

    setIsSending(true);
    try {
      const tableObj = tables.find(t => t.id === finalTableId);

      const result = await OrderController.submitOrder({
        branchId: currentUser.branchId,
        orderType,
        table: orderType === 'dine-in' && tableObj ? { id: tableObj.id, number: tableObj.number } : null,
        existingOrderId: tableObj?.currentOrderId,
        items: newItemsOnly.map(i => ({
          productId: i.productId,
          productName: i.productName,
          quantity: i.quantity,
          price: i.price,
          notes: i.notes,
        })),
        addedBy: currentUser.id,
        addedByName: currentUser.name,
        waiterId: currentUser.id,
      });

      if (!result.success) {
        toast.error('Failed to send order: ' + result.error);
        return;
      }

      setShowSuccess(true);
      setTimeout(async () => {
        setShowSuccess(false);
        setSelectedTableId(null);
        setCartItems([]);
        setOrderType(takeawayOnly ? 'takeaway' : 'dine-in');
        await refreshData();
        // In the cashier's takeaway-only flow, return to Tables so the new
        // takeaway appears under "Takeaway Orders" ready for payment.
        if (takeawayOnly) navigate('/tables');
      }, 2000);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex h-[100dvh] w-full bg-[#EAEEF3] overflow-hidden relative">

      {/* ─── SUCCESS NOTIFICATION ─── */}
      {showSuccess && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-white/10 backdrop-blur-[2px] animate-in fade-in duration-300">
          <div className="bg-orange-500 text-white px-8 py-8 sm:px-12 sm:py-10 rounded-[40px] shadow-2xl flex flex-col items-center gap-4 border-4 border-white animate-in zoom-in">
            <div className="bg-white rounded-full p-4"><CheckCircle2 className="size-12 sm:size-14 text-orange-500" strokeWidth={3} /></div>
            <div className="text-center font-black uppercase tracking-tighter"><h2 className="text-2xl sm:text-3xl leading-none">Order Sent</h2><p className="text-orange-100 text-xs mt-1">Kitchen notified</p></div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          MOBILE LAYOUT  (hidden on lg+)
          Two full-screen panels toggled by mobileView state
      ════════════════════════════════════════════════════════ */}

      {/* ── MOBILE: MENU PANEL ── */}
      <div className={`lg:hidden absolute inset-0 flex flex-col bg-[#EAEEF3] transition-transform duration-300 ${mobileView === 'menu' ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Top bar */}
        <div className="bg-white px-3 py-2.5 flex items-center gap-2 shadow-sm border-b">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
            <input type="text" placeholder="Search menu..." className="w-full pl-9 pr-3 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none ring-1 ring-gray-200" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          {currentUser.role === 'swaiter' && <SwaiterOptions compact user={currentUser} />}
          {takeawayOnly ? (
            <button onClick={() => navigate('/tables')} className="flex items-center gap-1.5 bg-white border px-3 py-2.5 rounded-xl text-xs font-black text-gray-700 shadow-sm whitespace-nowrap">
              <ArrowLeft className="size-3.5 text-orange-500" /> Tables
            </button>
          ) : (
            <button onClick={() => setShowTableOverlay(true)} className="flex items-center gap-1.5 bg-white border px-3 py-2.5 rounded-xl text-xs font-black text-gray-700 shadow-sm whitespace-nowrap">
              <Layers className="size-3.5 text-orange-500" /> Tables ({activeTables.length})
            </button>
          )}
          <div className="text-right border-l pl-2.5 border-gray-100 min-w-fit">
            <p className="text-[9px] font-bold text-orange-500 uppercase tracking-widest leading-none mb-0.5">{takeawayOnly ? 'Takeaway' : 'Waiter'}</p>
            <p className="text-xs font-black text-gray-900 leading-none">{currentUser.name}</p>
          </div>
        </div>

        {/* Products grid */}
        <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {filteredProducts.map(p => {
              const isAvailable = (p.kitchenStatus || 'available') === 'available' && (p.availabilityStatus || 'available') === 'available';
              return (
                <div
                  key={p.id}
                  onClick={() => { if (isAvailable) { addToCart(p); } }}
                  className={`rounded-[20px] shadow-sm transition-all border-2 active:scale-95 flex flex-col min-h-[100px] ${
                    isAvailable ? 'bg-white border-transparent cursor-pointer' : 'bg-red-50 border-red-200 cursor-not-allowed opacity-60'
                  }`}
                >
                  <div className="p-3 flex flex-col flex-1 justify-between gap-2 relative">
                    {!isAvailable && (
                      <div className="absolute inset-0 flex items-center justify-center z-10 rounded-[20px] bg-red-50/80">
                        <span className="bg-red-600 text-white px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-lg">N/A</span>
                      </div>
                    )}
                    <h3 className={`text-xs font-bold leading-snug break-words ${isAvailable ? 'text-gray-800' : 'text-red-400'}`}>{p.name}</h3>
                    <div className="mt-auto flex items-center justify-between gap-1">
                      <span className={`text-sm font-black ${isAvailable ? 'text-orange-600' : 'text-red-400'}`}>RM {p.price.toFixed(2)}</span>
                      {isAvailable && <div className="bg-orange-500 text-white p-1.5 rounded-lg"><Plus className="size-3.5" strokeWidth={4} /></div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Category tabs */}
        <div className="bg-white border-t px-2 py-2 flex gap-2 overflow-x-auto no-scrollbar">
          {sortedCategories.map(cat => (
            <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} className={`px-5 py-3 rounded-[16px] font-black whitespace-nowrap transition-all text-[10px] uppercase tracking-widest shadow-sm ${selectedCategory === cat.id ? 'bg-orange-500 text-white shadow-orange-200 -translate-y-0.5' : 'bg-gray-100 text-gray-500'}`}>{cat.name}</button>
          ))}
        </div>

        {/* Floating cart FAB */}
        <button
          onClick={() => setMobileView('cart')}
          className="absolute bottom-20 right-4 bg-orange-500 text-white rounded-full shadow-2xl shadow-orange-300 flex items-center gap-2 px-5 py-3.5 font-black text-sm transition-all active:scale-95"
        >
          <ShoppingCart className="size-5" />
          {newItemsOnly.length > 0 && (
            <span className="bg-white text-orange-500 rounded-full text-xs font-black px-2 py-0.5 leading-none">{newItemsOnly.reduce((s, i) => s + i.quantity, 0)}</span>
          )}
          <span>Cart {newItemsOnly.length > 0 ? `· RM ${cartTotal.toFixed(2)}` : ''}</span>
        </button>
      </div>

      {/* ── MOBILE: CART PANEL ── */}
      <div className={`lg:hidden absolute inset-0 flex flex-col bg-white transition-transform duration-300 ${mobileView === 'cart' ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Orange header with order type + back button */}
        <div className="bg-orange-500 p-3 relative">
          <div className="flex items-center gap-2 mb-2.5">
            <button onClick={() => setMobileView('menu')} className="bg-white/20 text-white p-2 rounded-xl hover:bg-white/30 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <span className="text-white font-black text-sm uppercase tracking-widest flex-1">Order</span>
            {selectedTable && <span className="text-white font-black italic text-base uppercase opacity-90">Table {selectedTable.number}</span>}
            {selectedTableId && <button onClick={() => setSelectedTableId(null)} className="bg-white/20 text-white p-2 rounded-xl hover:bg-white/30 transition-all"><X className="size-4" strokeWidth={3} /></button>}
          </div>
          {takeawayOnly ? (
            <div className="flex items-center justify-center gap-2 bg-white text-orange-600 py-3.5 rounded-[18px] shadow-xl font-black text-[11px] uppercase tracking-widest">
              <ShoppingBag className="size-4" /> Takeaway Order
            </div>
          ) : (
            <div className="flex bg-orange-600/30 p-1.5 rounded-[18px] shadow-inner">
              <button onClick={() => { setOrderType('dine-in'); setSelectedTableId(null); }} className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${orderType === 'dine-in' ? 'bg-white text-orange-600 shadow-xl' : 'text-white/70'}`}><Utensils className="size-4" /> Dine-In</button>
              <button onClick={() => { setOrderType('takeaway'); setSelectedTableId(null); }} className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${orderType === 'takeaway' ? 'bg-white text-orange-600 shadow-xl' : 'text-white/70'}`}><ShoppingBag className="size-4" /> Take-Away</button>
            </div>
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
          {existingItemsOnly.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-1 italic">Bill History</p>
              {existingItemsOnly.map(item => (
                <div key={item.id} className="bg-gray-50/80 rounded-2xl p-4 border border-dashed border-gray-200 flex items-center gap-3 opacity-60">
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-800 text-sm leading-tight">{item.productName}</h4>
                    <p className="text-[10px] font-bold text-gray-400 mt-0.5 uppercase tracking-wider">Status: {item.status}</p>
                  </div>
                  <div className="bg-gray-200 text-gray-600 px-3 py-1.5 rounded-xl text-[10px] font-black">×{item.quantity}</div>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2.5">
            <p className="text-[10px] font-black text-orange-500 uppercase tracking-[0.2em] px-1 italic">New Selection</p>
            {newItemsOnly.length === 0
              ? <div className="h-44 border-4 border-dashed border-gray-100 rounded-[32px] flex flex-col items-center justify-center text-gray-300"><ShoppingCart className="size-10 mb-2 opacity-10" /><span className="text-xs font-bold opacity-30 uppercase tracking-widest">Cart Empty</span></div>
              : newItemsOnly.map(item => (
                  <div key={item.id} className="bg-orange-50/50 rounded-2xl p-4 border border-orange-100 flex items-center gap-3 shadow-sm">
                    <div className="flex-1"><h4 className="font-bold text-gray-800 text-sm leading-tight">{item.productName}</h4><p className="text-orange-600 font-black text-xs mt-0.5">RM {item.price.toFixed(2)}</p></div>
                    <div className="flex items-center bg-white rounded-xl border-2 border-orange-100 p-1 gap-3 shadow-sm">
                      <button onClick={() => setCartItems(prev => prev.map(i => i.id === item.id ? {...i, quantity: Math.max(0, i.quantity - 1)} : i).filter(i => i.quantity > 0))} className="p-1.5 text-orange-500 hover:bg-orange-50 rounded-lg"><Minus className="size-4" strokeWidth={3} /></button>
                      <span className="font-black text-gray-900 w-5 text-center text-sm">{item.quantity}</span>
                      <button onClick={() => setCartItems(prev => prev.map(i => i.id === item.id ? {...i, quantity: i.quantity + 1} : i))} className="p-1.5 text-orange-500 hover:bg-orange-50 rounded-lg"><Plus className="size-4" strokeWidth={3} /></button>
                    </div>
                  </div>
                ))
            }
          </div>
        </div>

        {/* Total + CTA */}
        <div className="p-4 border-t bg-gray-50 pb-safe">
          <div className="flex justify-between items-end mb-4">
            <span className="text-gray-400 font-black text-[10px] uppercase tracking-[0.2em] italic">Total Due</span>
            <span className="text-2xl font-black text-gray-900 tracking-tighter">RM {cartTotal.toFixed(2)}</span>
          </div>
          <button onClick={() => handleSendToKitchen()} disabled={isSending || newItemsOnly.length === 0} className={`w-full font-black py-4 rounded-[20px] shadow-xl transition-all uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-2 ${newItemsOnly.length > 0 ? 'bg-orange-500 text-white shadow-orange-200 active:scale-[0.98]' : 'bg-gray-200 text-gray-400'}`}>
            <ShoppingBag className="size-5" /> {isSending ? 'Sending...' : (orderType === 'takeaway' ? 'Send Takeaway' : (selectedTableId ? 'Confirm Order' : 'Choose Table'))}
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          DESKTOP LAYOUT  (hidden below lg)
      ════════════════════════════════════════════════════════ */}

      {/* ── DESKTOP: LEFT MENU SECTION ── */}
      <div className="hidden lg:flex flex-1 flex-col min-w-0">
        <div className="bg-white p-4 flex items-center justify-between shadow-sm border-b">
          <div className="relative w-80 xl:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
            <input type="text" placeholder="Search menu..." className="w-full pl-10 pr-4 py-3 bg-gray-100 rounded-2xl text-sm focus:outline-none ring-1 ring-gray-200" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            {currentUser.role === 'swaiter' && <SwaiterOptions user={currentUser} />}
            {takeawayOnly ? (
              <button onClick={() => navigate('/tables')} className="flex items-center gap-2 bg-white border px-5 py-2.5 rounded-2xl text-sm font-black text-gray-700 hover:bg-gray-50 transition-all shadow-sm">
                <ArrowLeft className="size-4 text-orange-500" /> Back to Tables
              </button>
            ) : (
              <button onClick={() => setShowTableOverlay(true)} className="flex items-center gap-2 bg-white border px-5 py-2.5 rounded-2xl text-sm font-black text-gray-700 hover:bg-gray-50 transition-all shadow-sm">
                <Layers className="size-4 text-orange-500" /> Active Tables ({activeTables.length})
              </button>
            )}
            <div className="text-right ml-4 border-l pl-4 border-gray-100">
              <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest leading-none mb-1">{takeawayOnly ? 'Takeaway' : 'Waiter'}</p>
              <p className="text-sm font-black text-gray-900 leading-none">{currentUser.name}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <div className="grid grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
            {filteredProducts.map(p => {
              const isAvailable = (p.kitchenStatus || 'available') === 'available' && (p.availabilityStatus || 'available') === 'available';
              return (
                <div
                  key={p.id}
                  onClick={() => isAvailable && addToCart(p)}
                  className={`rounded-[24px] shadow-sm transition-all border-2 active:scale-95 group flex flex-col min-h-[120px] ${
                    isAvailable ? 'bg-white border-transparent hover:shadow-md cursor-pointer' : 'bg-red-50 border-red-200 cursor-not-allowed opacity-60'
                  }`}
                >
                  <div className="p-4 flex flex-col flex-1 justify-between gap-3 relative">
                    {!isAvailable && (
                      <div className="absolute inset-0 flex items-center justify-center z-10">
                        <span className="bg-red-600 text-white px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-lg">Not Available</span>
                      </div>
                    )}
                    <h3 className={`text-sm font-bold leading-snug tracking-tight break-words ${isAvailable ? 'text-gray-800' : 'text-red-400'}`}>{p.name}</h3>
                    <div className="mt-auto flex items-center justify-between gap-2">
                      <span className={`font-black ${isAvailable ? 'text-orange-600' : 'text-red-400'}`}>RM {p.price.toFixed(2)}</span>
                      {isAvailable && <div className="bg-orange-500 text-white p-2 rounded-xl"><Plus className="size-4" strokeWidth={4} /></div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white border-t p-3 flex gap-2 overflow-x-auto no-scrollbar">
          {sortedCategories.map(cat => (
            <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} className={`px-10 py-5 rounded-[22px] font-black whitespace-nowrap transition-all text-[10px] uppercase tracking-widest shadow-sm ${selectedCategory === cat.id ? 'bg-orange-500 text-white shadow-orange-200 -translate-y-1' : 'bg-gray-100 text-gray-500'}`}>{cat.name}</button>
          ))}
        </div>
      </div>

      {/* ── DESKTOP: RIGHT SIDEBAR ── */}
      <aside className="hidden lg:flex w-[380px] xl:w-[400px] bg-white border-l flex-col shadow-2xl z-10">
        <div className="p-5 bg-orange-500 relative">
          {takeawayOnly ? (
            <div className="flex items-center justify-center gap-2 bg-white text-orange-600 py-4 rounded-[22px] shadow-xl font-black text-xs uppercase tracking-widest">
              <ShoppingBag className="size-4" /> Takeaway Order
            </div>
          ) : (
            <div className="flex bg-orange-600/30 p-1.5 rounded-[22px] relative shadow-inner">
              <button onClick={() => { setOrderType('dine-in'); setSelectedTableId(null); }} className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${orderType === 'dine-in' ? 'bg-white text-orange-600 shadow-xl' : 'text-white/70'}`}><Utensils className="size-4" /> Dine-In</button>
              <button onClick={() => { setOrderType('takeaway'); setSelectedTableId(null); }} className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${orderType === 'takeaway' ? 'bg-white text-orange-600 shadow-xl' : 'text-white/70'}`}><ShoppingBag className="size-4" /> Take-Away</button>
              {selectedTableId && (
                <button onClick={() => setSelectedTableId(null)} className="absolute -right-2 -top-2 bg-white text-orange-600 p-2 rounded-full shadow-2xl border-2 border-orange-100 hover:scale-110 transition-all"><X className="size-4" strokeWidth={4} /></button>
              )}
            </div>
          )}
          {selectedTable && (
            <div className="mt-4 text-center"><span className="text-white font-black italic tracking-tighter text-2xl uppercase opacity-90">Table {selectedTable.number}</span></div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
          {existingItemsOnly.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-2 italic">Bill History</p>
              {existingItemsOnly.map(item => (
                <div key={item.id} className="bg-gray-50/80 rounded-3xl p-5 border border-dashed border-gray-200 flex items-center gap-4 opacity-60">
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-800 text-sm leading-tight">{item.productName}</h4>
                    <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-wider">Status: {item.status}</p>
                  </div>
                  <div className="bg-gray-200 text-gray-600 px-3 py-1.5 rounded-xl text-[10px] font-black">×{item.quantity}</div>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-3">
            <p className="text-[10px] font-black text-orange-500 uppercase tracking-[0.2em] px-2 italic">New Selection</p>
            {newItemsOnly.length === 0
              ? <div className="h-48 border-4 border-dashed border-gray-50 rounded-[40px] flex flex-col items-center justify-center text-gray-300 italic"><ShoppingCart className="size-12 mb-3 opacity-10" /><span className="text-sm font-bold opacity-30 uppercase tracking-widest tracking-tighter">Cart Empty</span></div>
              : newItemsOnly.map(item => (
                  <div key={item.id} className="bg-orange-50/50 rounded-3xl p-5 border border-orange-100 flex items-center gap-4 animate-in slide-in-from-right-4 shadow-sm">
                    <div className="flex-1"><h4 className="font-bold text-gray-800 text-sm leading-tight">{item.productName}</h4><p className="text-orange-600 font-black text-xs mt-1">RM {item.price.toFixed(2)}</p></div>
                    <div className="flex items-center bg-white rounded-2xl border-2 border-orange-100 p-1.5 gap-4 shadow-sm">
                      <button onClick={() => setCartItems(prev => prev.map(i => i.id === item.id ? {...i, quantity: Math.max(0, i.quantity - 1)} : i).filter(i => i.quantity > 0))} className="p-1.5 text-orange-500 hover:bg-orange-50 rounded-lg"><Minus className="size-4" strokeWidth={3} /></button>
                      <span className="font-black text-gray-900 w-4 text-center text-sm">{item.quantity}</span>
                      <button onClick={() => setCartItems(prev => prev.map(i => i.id === item.id ? {...i, quantity: i.quantity + 1} : i))} className="p-1.5 text-orange-500 hover:bg-orange-50 rounded-lg"><Plus className="size-4" strokeWidth={3} /></button>
                    </div>
                  </div>
                ))
            }
          </div>
        </div>

        <div className="p-8 border-t bg-gray-50">
          <div className="flex justify-between items-end mb-6"><span className="text-gray-400 font-black text-[10px] uppercase tracking-[0.2em] italic leading-none">Total Due</span><span className="text-3xl font-black text-gray-900 leading-none tracking-tighter">RM {cartTotal.toFixed(2)}</span></div>
          <button onClick={() => handleSendToKitchen()} disabled={isSending || newItemsOnly.length === 0} className={`w-full font-black py-5 rounded-[24px] shadow-2xl transition-all uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 ${newItemsOnly.length > 0 ? 'bg-orange-500 text-white hover:scale-[1.02] shadow-orange-200' : 'bg-gray-200 text-gray-400'}`}>
            <ShoppingBag className="size-5" /> {isSending ? 'Sending...' : (orderType === 'takeaway' ? 'Send Takeaway' : (selectedTableId ? 'Confirm Order' : 'Choose Table'))}
          </button>
        </div>
      </aside>

      {/* ─── MODALS (shared by both layouts) ─── */}
      {!takeawayOnly && showTableModal && (
        <div className="fixed inset-0 z-[101] bg-black/70 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6">
          <div className="bg-white rounded-[40px] sm:rounded-[50px] w-full max-w-2xl p-8 sm:p-12 shadow-2xl">
            <div className="flex justify-between items-center mb-7 sm:mb-10">
              <h2 className="text-2xl sm:text-4xl font-black text-gray-900 tracking-tighter uppercase italic leading-none">Select Table</h2>
              <button onClick={() => setShowTableModal(false)} className="bg-gray-100 p-3 rounded-full hover:bg-gray-200"><X className="size-6 sm:size-8 text-gray-400" /></button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 sm:gap-6 max-h-[55vh] overflow-y-auto pr-1 custom-scrollbar">
              {availableTables.map(t => (
                <button key={t.id} onClick={() => { handleSendToKitchen(t.id); setShowTableModal(false); }} className="p-5 sm:p-8 rounded-[28px] sm:rounded-[35px] border-4 border-emerald-50 bg-emerald-50/30 text-left hover:border-emerald-500 hover:bg-white transition-all shadow-sm active:scale-95">
                  <p className="text-2xl sm:text-3xl font-black text-gray-900 italic leading-none mb-1">T-{t.number}</p>
                  <p className="text-[10px] font-black text-emerald-600 opacity-60 uppercase tracking-widest">Available</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {!takeawayOnly && showTableOverlay && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-[40px] sm:rounded-[55px] w-full max-w-4xl p-8 sm:p-12 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-7 sm:mb-10">
              <div>
                <h2 className="text-3xl sm:text-5xl font-black text-gray-900 tracking-tighter uppercase italic leading-none">Active Tables</h2>
                <p className="text-gray-400 font-bold uppercase text-[10px] tracking-[0.3em] mt-2 ml-1">Current Open Bills</p>
              </div>
              <button onClick={() => setShowTableOverlay(false)} className="bg-gray-100 p-3 sm:p-4 rounded-full hover:bg-gray-200"><X className="size-7 sm:size-10 text-gray-400" /></button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-8 overflow-y-auto custom-scrollbar pr-2">
              {activeTables.map(t => (
                <button key={t.id} onClick={() => { setSelectedTableId(t.id); setOrderType('dine-in'); setShowTableOverlay(false); setMobileView('cart'); }} className="p-6 sm:p-10 rounded-[36px] sm:rounded-[45px] border-4 border-orange-50 bg-orange-50/50 text-left hover:border-orange-500 hover:bg-white transition-all group active:scale-95">
                  <div className="flex items-center justify-between mb-4 sm:mb-6"><Utensils className="size-5 sm:size-7 text-orange-500 opacity-40 group-hover:opacity-100" /><span className="bg-orange-500 text-white text-[9px] px-2.5 py-1 rounded-full font-black tracking-widest uppercase">Ordered</span></div>
                  <p className="text-3xl sm:text-4xl font-black text-gray-800 italic group-hover:text-orange-600 transition-colors leading-none tracking-tighter">T-{t.number}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`.no-scrollbar::-webkit-scrollbar { display: none; } .custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #F97316; border-radius: 10px; } .pb-safe { padding-bottom: max(1rem, env(safe-area-inset-bottom)); }`}</style>
    </div>
  );
}