/**
 * SecureQROrderingView.tsx
 *
 * Customer-facing ordering page reached via a secure QR code.
 * The URL contains only a random token — the real table ID is never exposed.
 *
 * Flow:
 *   1. Read token from URL param.
 *   2. Validate token against qr_sessions in Supabase (checks active + expiry).
 *   3. Resolve the real tableId internally.
 *   4. Render the full ordering UI with the resolved tableId.
 */

import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router';
import { supabase } from '../../../lib/supabase';
import { validateQrToken, QrSession } from '../../services/QrService';
import { Product, Category, Table, ModifierGroup, SelectedModifier } from '../../models/types';
import { OrderController } from '../../controllers/OrderController';
import { ModifierController } from '../../controllers/ModifierController';
import { ModifierPickerModal } from '../../components/ModifierPickerModal';
import { toast } from 'sonner';
import {
  Plus, Minus, ShoppingCart, Search, X,
  CheckCircle2, ShoppingBag, Bell, ChevronDown, UtensilsCrossed, ShieldAlert,
} from 'lucide-react';

// ─── Token validation wrapper ─────────────────────────────────────────────────

type ValidationState = 'loading' | 'valid' | 'invalid';

export function SecureQROrderingView() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<ValidationState>('loading');
  const [session, setSession] = useState<QrSession | null>(null);

  useEffect(() => {
    const validate = async () => {
      if (!token) { setState('invalid'); return; }
      const result = await validateQrToken(token);
      if (!result) { setState('invalid'); return; }
      setSession(result);
      setState('valid');
    };
    void validate();
  }, [token]);

  if (state === 'loading') {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#EAEEF3]">
        <div className="flex flex-col items-center gap-5">
          <div className="bg-orange-500 rounded-[28px] p-5 shadow-2xl shadow-orange-200">
            <UtensilsCrossed className="size-10 text-white" />
          </div>
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-black text-gray-400 uppercase tracking-[0.3em]">Verifying QR Code…</p>
        </div>
      </div>
    );
  }

  if (state === 'invalid') {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#EAEEF3] px-4">
        <div className="bg-white rounded-[40px] shadow-2xl p-10 max-w-sm w-full text-center">
          <div className="bg-red-100 rounded-full p-4 w-fit mx-auto mb-5">
            <ShieldAlert className="size-10 text-red-500" />
          </div>
          <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight mb-2">Invalid QR Code</h2>
          <p className="text-sm text-gray-400">
            This QR code is invalid or has expired. Please scan the QR code on your table
            or ask a team member for help.
          </p>
        </div>
      </div>
    );
  }

  if (session) {
    return <SecureOrderingUI tableId={session.tableId} />;
  }

  return null;
}

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

export function SecureOrderingUI({ tableId, addedBy = 'guest', addedByName = 'Guest', groupOrderId }: { tableId: string; addedBy?: string; addedByName?: string; groupOrderId?: string }) {
  const [table, setTable]                 = useState<Table | null>(null);
  const [orderId, setOrderId]             = useState<string | null>(null);
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
  const [callingWaiter, setCallingWaiter] = useState(false);
  const [mobileView, setMobileView]       = useState<'menu' | 'cart'>('menu');
  const [expandedNotes, setExpandedNotes] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: tableRow, error } = await supabase
        .from('tables').select('*').eq('id', tableId).single();
      if (error || !tableRow) { setInvalidTable(true); setLoading(false); return; }

      const branchId = tableRow.branch_id;
      setTable({
        id: tableRow.id, number: tableRow.number, capacity: tableRow.capacity,
        status: tableRow.status, branchId,
        currentOrderId: tableRow.current_order_id,
        assignedCashierId: tableRow.assigned_cashier_id,
        needsWaiter: tableRow.needs_waiter ?? false,
      });

      const [productsRes, categoriesRes] = await Promise.all([
        supabase.from('products').select('*').eq('branch_id', branchId).eq('is_active', true).order('name'),
        supabase.from('categories').select('*').eq('branch_id', branchId).eq('is_active', true).order('display_order'),
      ]);

      const prods: Product[] = (productsRes.data ?? []).map((p: any) => ({
        id: p.id, name: p.name, category: p.category ?? '', categoryId: p.category_id,
        price: Number(p.price), stock: p.stock ?? 0, image: p.image,
        sku: p.sku, taxRate: Number(p.tax_rate ?? 0), reorderPoint: p.reorder_point ?? 0,
        branchId: p.branch_id, station: p.station ?? 'kitchen',
        kitchenStatus: p.kitchen_status ?? 'available',
        availabilityStatus: p.availability_status ?? 'available',
        isActive: p.is_active ?? true, createdAt: new Date(p.created_at),
      }));
      setProducts(prods);
      const productIds = prods.map(p => p.id);
      setModifierMap(await ModifierController.getGroupsForProducts(productIds));

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

      // In group mode use the group's single shared order; otherwise the table's.
      const loadOrderId = groupOrderId || tableRow.current_order_id;
      if (loadOrderId) {
        const { data: orderData } = await supabase
          .from('orders').select('*, order_items(*)')
          .eq('id', loadOrderId).single();
        if (orderData) {
          setOrderId(orderData.id);
          setExistingItems((orderData.order_items ?? []).map((item: any) => ({
            id: item.id, productId: item.product_id, productName: item.product_name,
            price: Number(item.price), quantity: Number(item.quantity), status: item.status,
            addedByName: item.added_by_name,
          })));
        }
      }
      setLoading(false);
    };
    void load();
  }, [tableId, groupOrderId]);

  // Group mode: keep the SHARED cart live so every guest sees everyone's items.
  useEffect(() => {
    if (!groupOrderId) return;
    const refetch = async () => {
      const { data } = await supabase.from('orders').select('order_items(*)').eq('id', groupOrderId).single();
      if (data) {
        setExistingItems((data.order_items ?? []).map((item: any) => ({
          id: item.id, productId: item.product_id, productName: item.product_name,
          price: Number(item.price), quantity: Number(item.quantity), status: item.status,
          addedByName: item.added_by_name,
        })));
      }
    };
    const channel = supabase
      .channel(`group-order-${groupOrderId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items', filter: `order_id=eq.${groupOrderId}` }, () => { void refetch(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [groupOrderId]);

  // Realtime product availability sync
  useEffect(() => {
    if (!table?.branchId) return;
    const channel = supabase
      .channel(`secure-qr-products-${table.branchId}`)
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
    const { error } = await supabase.from('tables').update({ needs_waiter: true }).eq('id', table.id);
    if (error) toast.error('Could not call waiter. Try again.');
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
      const result = await OrderController.submitOrder({
        branchId: table.branchId,
        orderType: 'dine-in',
        table: { id: table.id, number: table.number },
        // Always target the ONE shared group order so the whole party = one bill.
        existingOrderId: groupOrderId ?? orderId ?? table.currentOrderId,
        items: cartItems.map(item => ({
          productId: item.productId, productName: item.productName,
          quantity: item.quantity, price: item.price,
          notes: item.notes, station: item.station, modifiers: item.modifiers,
        })),
        addedBy,
        addedByName,
      });
      if (!result.success) { toast.error(result.error); return; }
      setOrderId(result.data.id);
      setTable(prev => prev ? { ...prev, status: 'occupied', currentOrderId: result.data.id } : prev);
      setExistingItems((result.data.items ?? []).map((item: any) => ({
        id: item.id, productId: item.productId, productName: item.productName,
        price: item.price, quantity: item.quantity, status: item.status,
        addedByName: item.addedByName,
      })));
      setCartItems([]);
      setExpandedNotes(null);
      setSuccess(true);
      setTimeout(() => { setSuccess(false); setMobileView('menu'); }, 2500);
    } finally {
      setSubmitting(false);
    }
  };

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
        <div>
          <h1 className="font-black text-gray-900 text-lg leading-tight">Table {table?.number}</h1>
          <p className="text-[11px] text-gray-400 font-medium">Alnawras Restaurant</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCallWaiter}
            disabled={callingWaiter || table?.needsWaiter}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
              table?.needsWaiter
                ? 'bg-amber-100 text-amber-700 cursor-default'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-95'
            }`}
          >
            <Bell className="size-3.5" />
            {table?.needsWaiter ? 'Called!' : 'Call Waiter'}
          </button>
          <button
            onClick={() => setMobileView(mobileView === 'menu' ? 'cart' : 'menu')}
            className="relative bg-orange-500 text-white p-2.5 rounded-xl shadow-lg shadow-orange-200 active:scale-95"
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

      {mobileView === 'menu' ? (
        <>
          {/* Search */}
          <div className="px-4 py-3 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search menu…"
                className="w-full pl-9 pr-4 py-2.5 bg-white rounded-xl text-sm border-0 shadow-sm outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
          </div>

          {/* Category tabs */}
          {!searchQuery && (
            <div className="flex gap-2 px-4 pb-3 overflow-x-auto flex-shrink-0 scrollbar-none">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
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
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <UtensilsCrossed className="size-10 text-gray-200 mb-3" />
                <p className="text-sm text-gray-400 font-medium">No items found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filteredProducts.map(p => {
                  const isAvailable =
                    (p.kitchenStatus || 'available') === 'available' &&
                    (p.availabilityStatus || 'available') === 'available';
                  return (
                    <div
                      key={p.id}
                      onClick={() => isAvailable && addToCart(p)}
                      className={`rounded-[20px] shadow-sm border-2 active:scale-95 flex flex-col min-h-[100px] transition-all ${
                        isAvailable
                          ? 'bg-white border-transparent cursor-pointer hover:shadow-md'
                          : 'bg-red-50 border-red-200 cursor-not-allowed opacity-60'
                      }`}
                    >
                      <div className="p-3 flex flex-col flex-1 justify-between gap-2 relative">
                        {!isAvailable && (
                          <div className="absolute inset-0 flex items-center justify-center z-10 rounded-[20px] bg-red-50/80">
                            <span className="bg-red-600 text-white px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-lg">N/A</span>
                          </div>
                        )}
                        <h3 className={`font-bold leading-snug break-words text-xs ${isAvailable ? 'text-gray-800' : 'text-red-400'}`}>{p.name}</h3>
                        <div className="mt-auto flex items-center justify-between gap-1">
                          <span className={`font-black text-sm ${isAvailable ? 'text-orange-600' : 'text-red-400'}`}>RM {p.price.toFixed(2)}</span>
                          {isAvailable && <div className="bg-orange-500 text-white rounded-xl p-1.5"><Plus className="size-3.5" strokeWidth={4} /></div>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Cart view */
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <h2 className="font-black text-gray-900 text-lg">Your Order</h2>

          {existingItems.length > 0 && (
            <div className="bg-white rounded-2xl p-4 space-y-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{groupOrderId ? 'Table Order · everyone' : 'Already Ordered'}</p>
              {existingItems.map(item => (
                <div key={item.id} className="flex items-center justify-between text-sm gap-2">
                  <span className="text-gray-700 flex-1 min-w-0">
                    {item.quantity}× {item.productName}
                    {groupOrderId && item.addedByName && <em className="text-gray-400 not-italic"> · {item.addedByName}</em>}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${statusColors[item.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {item.status}
                  </span>
                </div>
              ))}
              <div className="border-t pt-2 flex justify-between text-xs font-bold text-gray-500">
                <span>Table Total</span><span>RM {existingTotal.toFixed(2)}</span>
              </div>
            </div>
          )}

          {cartItems.length === 0 && existingItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ShoppingCart className="size-10 text-gray-200 mb-3" />
              <p className="text-sm text-gray-400 font-medium">Your cart is empty</p>
              <button onClick={() => setMobileView('menu')} className="mt-3 text-orange-500 text-sm font-bold">Browse Menu →</button>
            </div>
          )}

          {cartItems.map(item => (
            <div key={item.id} className="bg-orange-50/50 rounded-2xl p-4 border border-orange-100 shadow-sm space-y-3 animate-in slide-in-from-right-4">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <h4 className="font-bold text-gray-800 text-sm">{item.productName}</h4>
                  {!!item.modifiers?.length && (
                    <p className="text-[11px] text-gray-500">{item.modifiers.map(m => m.optionName).join(', ')}</p>
                  )}
                  <p className="text-orange-600 font-black text-xs mt-0.5">RM {item.price.toFixed(2)}</p>
                </div>
                <div className="flex items-center bg-white border-2 border-orange-100 shadow-sm rounded-xl p-1 gap-3">
                  <button
                    onClick={() => setCartItems(prev =>
                      prev.map(i => i.id === item.id ? { ...i, quantity: Math.max(0, i.quantity - 1) } : i)
                        .filter(i => i.quantity > 0)
                    )}
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
                {item.notes ? 'Edit note' : 'Add note'}
              </button>
              {expandedNotes === item.id && (
                <textarea
                  value={item.notes}
                  onChange={e => setCartItems(prev => prev.map(i => i.id === item.id ? { ...i, notes: e.target.value } : i))}
                  placeholder="e.g. No onions, extra spicy…"
                  className="w-full text-xs bg-white border border-orange-200 rounded-xl p-2.5 resize-none outline-none focus:ring-2 focus:ring-orange-300"
                  rows={2}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Place order button */}
      {mobileView === 'cart' && cartItems.length > 0 && (
        <div className="px-4 pb-safe pt-3 bg-white border-t flex-shrink-0">
          {success ? (
            <div className="flex items-center justify-center gap-2 py-4 text-emerald-600 font-black animate-in zoom-in">
              <CheckCircle2 className="size-6" /> Order Sent!
            </div>
          ) : (
            <button
              onClick={handleSubmitOrder}
              disabled={submitting}
              className="w-full bg-orange-500 text-white py-4 rounded-2xl font-black text-base shadow-xl shadow-orange-200 active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sending…</>
              ) : (
                <><ShoppingBag className="size-5" /> Place Order · RM {cartTotal.toFixed(2)}</>
              )}
            </button>
          )}
        </div>
      )}

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
