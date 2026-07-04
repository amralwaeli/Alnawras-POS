/**
 * PickupOrderingView.tsx
 *
 * Public, token-gated customer page for Pickup Orders (/#/pickup/:token).
 * Flow: validate link → browse menu → cart → customer details → pickup method
 * → payment (cash at pickup, or online QR + receipt upload) → acknowledge the
 * Grab/Lalamove notice → submit.
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { supabase } from '../../../lib/supabase';
import { Product, Category, ModifierGroup, SelectedModifier } from '../../models/types';
import { PickupController } from '../../controllers/PickupController';
import { ModifierController } from '../../controllers/ModifierController';
import { ModifierPickerModal } from '../../components/ModifierPickerModal';
import {
  validatePickupToken, PickupToken, uploadReceipt, merchantQrUrl,
} from '../../services/PickupService';
import { validateUpload, RECEIPT_TYPES, MB } from '../../../lib/upload';
import {
  Plus, Minus, ShoppingCart, Search, X, CheckCircle2, ShoppingBag,
  UtensilsCrossed, ShieldAlert, Bike, Truck, Store, Upload, ChevronDown, ArrowLeft,
} from 'lucide-react';
import { ProductImage } from '../../components/ProductImage';

const RM = (n: number) => `RM ${n.toFixed(2)}`;

export function PickupOrderingView() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<'loading' | 'valid' | 'invalid'>('loading');
  const [session, setSession] = useState<PickupToken | null>(null);

  useEffect(() => {
    (async () => {
      if (!token) { setState('invalid'); return; }
      const res = await validatePickupToken(token);
      if (!res) { setState('invalid'); return; }
      setSession(res);
      setState('valid');
    })();
  }, [token]);

  if (state === 'loading') {
    return <Splash label="Verifying link…" />;
  }
  if (state === 'invalid' || !session) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#EAEEF3] px-4">
        <div className="bg-white rounded-[40px] shadow-2xl p-10 max-w-sm w-full text-center">
          <div className="bg-red-100 rounded-full p-4 w-fit mx-auto mb-5"><ShieldAlert className="size-10 text-red-500" /></div>
          <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight mb-2">Link Unavailable</h2>
          <p className="text-sm text-gray-400">This pickup link is invalid, expired, or the order has already been completed. Please ask the restaurant for a new link.</p>
        </div>
      </div>
    );
  }
  return <PickupFlow token={session.token} branchId={session.branchId} />;
}

function Splash({ label }: { label: string }) {
  return (
    <div className="flex h-[100dvh] items-center justify-center bg-[#EAEEF3]">
      <div className="flex flex-col items-center gap-5">
        <div className="bg-orange-500 rounded-[28px] p-5 shadow-2xl shadow-orange-200"><UtensilsCrossed className="size-10 text-white" /></div>
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-black text-gray-400 uppercase tracking-[0.3em]">{label}</p>
      </div>
    </div>
  );
}

interface CartItem { id: string; productId: string; productName: string; price: number; quantity: number; taxRate: number; station: string; notes: string; modifiers?: SelectedModifier[]; }
type Method = 'grab' | 'lalamove' | 'self';
type PayType = 'cash' | 'online';

const NOTICE = 'Please DO NOT book Grab Express or Lalamove until the restaurant marks your order as READY. You will receive an email notification once the order is ready for collection.';

function PickupFlow({ token, branchId }: { token: string; branchId: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [view, setView] = useState<'menu' | 'checkout'>('menu');
  const [expandedNotes, setExpandedNotes] = useState<string | null>(null);
  const [modifierMap, setModifierMap] = useState<Record<string, ModifierGroup[]>>({});
  const [picking, setPicking] = useState<Product | null>(null);

  // checkout fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [method, setMethod] = useState<Method | null>(null);
  const [payType, setPayType] = useState<PayType | null>(null);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [ack, setAck] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [productsRes, categoriesRes] = await Promise.all([
        supabase.from('products').select('*').eq('branch_id', branchId).eq('is_active', true).order('name'),
        supabase.from('categories').select('*').eq('branch_id', branchId).eq('is_active', true).order('display_order'),
      ]);
      setProducts((productsRes.data ?? []).map((p: any) => ({
        id: p.id, name: p.name, category: p.category ?? '', categoryId: p.category_id,
        price: Number(p.price), stock: p.stock ?? 0, image: p.image, sku: p.sku,
        taxRate: Number(p.tax_rate ?? 0), reorderPoint: p.reorder_point ?? 0, branchId: p.branch_id,
        station: p.station ?? 'kitchen', kitchenStatus: p.kitchen_status ?? 'available',
        availabilityStatus: p.availability_status ?? 'available', isActive: p.is_active ?? true,
        createdAt: new Date(p.created_at),
      })));
      const cats: Category[] = (categoriesRes.data ?? []).map((c: any) => ({
        id: c.id, name: c.name, description: c.description, color: c.color ?? '#f97316', icon: c.icon,
        displayOrder: Number(c.display_order ?? 0), isActive: c.is_active ?? true, branchId: c.branch_id,
        createdAt: new Date(c.created_at),
      }));
      setCategories(cats);
      if (cats.length) setSelectedCategory(cats[0].id);
      const productIds = (productsRes.data ?? []).map((p: any) => p.id);
      setModifierMap(await ModifierController.getGroupsForProducts(productIds));
      setLoading(false);
    })();
  }, [branchId]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const active = categories.find(c => c.id === selectedCategory);
    return products.filter(p => {
      if (q) return p.name.toLowerCase().includes(q);
      return selectedCategory ? p.categoryId === selectedCategory || (!!active && p.category?.toLowerCase() === active.name.toLowerCase()) : false;
    });
  }, [products, categories, selectedCategory, searchQuery]);

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const tax = cart.reduce((s, i) => s + i.price * i.quantity * (i.taxRate || 0), 0);
  const total = subtotal + tax;
  const totalItems = cart.reduce((s, i) => s + i.quantity, 0);

  const addToCart = (p: Product) => {
    if (modifierMap[p.id]?.length) { setPicking(p); return; }
    setCart(prev => {
      const ex = prev.find(i => i.productId === p.id && !i.modifiers?.length);
      if (ex) return prev.map(i => i.id === ex.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { id: `c-${Date.now()}`, productId: p.id, productName: p.name, price: p.price, quantity: 1, taxRate: p.taxRate || 0, station: p.station || 'kitchen', notes: '' }];
    });
  };

  const addWithModifiers = (p: Product, selected: SelectedModifier[], extra: number) => {
    setCart(prev => [...prev, {
      id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      productId: p.id, productName: p.name, price: p.price + extra, quantity: 1,
      taxRate: p.taxRate || 0, station: p.station || 'kitchen', notes: '', modifiers: selected,
    }]);
    setPicking(null);
  };
  const setQty = (id: string, delta: number) => setCart(prev => prev.map(i => i.id === id ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i).filter(i => i.quantity > 0));
  const setNotes = (id: string, notes: string) => setCart(prev => prev.map(i => i.id === id ? { ...i, notes } : i));

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = cart.length > 0 && name.trim() && phone.trim() && emailValid && method && payType
    && (payType === 'cash' || receipt) && ack;

  const submit = async () => {
    setError('');
    if (cart.length === 0) { setError('Add at least one item.'); return; }
    if (!name.trim() || !phone.trim()) { setError('Please enter your name and phone number.'); return; }
    if (!emailValid) { setError('Please enter a valid email address for status updates.'); return; }
    if (!method) { setError('Please choose a pickup method.'); return; }
    if (!payType) { setError('Please choose a payment option.'); return; }
    if (payType === 'online' && !receipt) { setError('Please upload your payment receipt.'); return; }
    if (payType === 'online' && receipt) {
      const verr = validateUpload(receipt, RECEIPT_TYPES, 15 * MB);
      if (verr) { setError(verr); return; }
    }
    if (!ack) { setError('Please acknowledge the pickup notice.'); return; }

    setSubmitting(true);
    try {
      let receiptUrl: string | undefined;
      if (payType === 'online' && receipt) {
        const url = await uploadReceipt(token, receipt);
        if (!url) { setError('Receipt upload failed. Please try again.'); setSubmitting(false); return; }
        receiptUrl = url;
      }
      const res = await PickupController.submitPickupOrder({
        token, branchId,
        items: cart.map(i => ({ productId: i.productId, productName: i.productName, quantity: i.quantity, price: i.price, notes: i.notes, station: i.station as any, modifiers: i.modifiers })),
        method: method!, payType: payType!, customerName: name.trim(), customerPhone: phone.trim(), customerEmail: email.trim(), receiptUrl,
      });
      if (!res.success) { setError(res.error || 'Could not place order.'); setSubmitting(false); return; }
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Splash label="Loading menu…" />;

  if (done) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#EAEEF3] px-4">
        <div className="bg-white rounded-[40px] shadow-2xl p-10 max-w-sm w-full text-center">
          <div className="bg-emerald-100 rounded-full p-4 w-fit mx-auto mb-5"><CheckCircle2 className="size-12 text-emerald-600" /></div>
          <h2 className="text-2xl font-black text-gray-900 mb-2">Order Placed!</h2>
          <p className="text-sm text-gray-500">
            {payType === 'online'
              ? 'Your payment is being verified by the restaurant. '
              : 'Please pay when you collect your order. '}
            You'll be notified once it's <b>READY</b> for collection.
          </p>
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-800 text-left">{NOTICE}</div>
        </div>
      </div>
    );
  }

  const methodBtn = (m: Method, label: string, Icon: any) => (
    <button onClick={() => setMethod(m)} className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border-2 text-xs font-bold transition-all ${method === m ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600'}`}>
      <Icon className="size-5" /> {label}
    </button>
  );

  return (
    <div className="flex flex-col h-[100dvh] bg-[#EAEEF3] overflow-hidden">
      {/* Header */}
      <div className="bg-white px-4 pt-safe pb-3 shadow-sm flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="bg-orange-500 rounded-xl p-2"><UtensilsCrossed className="size-5 text-white" /></div>
          <div>
            <h1 className="font-black text-gray-900 text-base leading-tight">Alnawras Restaurant</h1>
            <p className="text-[11px] text-orange-500 font-bold uppercase tracking-wider">Pickup Order</p>
          </div>
        </div>
        {view === 'menu' ? (
          <button onClick={() => setView('checkout')} disabled={cart.length === 0}
            className="relative bg-orange-500 text-white p-2.5 rounded-xl shadow-lg shadow-orange-200 active:scale-95 disabled:opacity-40">
            <ShoppingCart className="size-5" />
            {totalItems > 0 && <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-black rounded-full size-5 flex items-center justify-center">{totalItems}</span>}
          </button>
        ) : (
          <button onClick={() => setView('menu')} className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-2 rounded-xl text-xs font-bold"><ArrowLeft className="size-4" /> Menu</button>
        )}
      </div>

      {view === 'menu' ? (
        <>
          <div className="px-4 py-3 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search menu…"
                className="w-full pl-9 pr-4 py-2.5 bg-white rounded-xl text-sm border-0 shadow-sm outline-none focus:ring-2 focus:ring-orange-300" />
            </div>
          </div>
          {!searchQuery && (
            <div className="flex gap-2 px-4 pb-3 overflow-x-auto flex-shrink-0">
              {categories.map(cat => (
                <button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
                  className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all ${selectedCategory === cat.id ? 'bg-orange-500 text-white shadow-lg shadow-orange-200' : 'bg-white text-gray-600'}`}>
                  {cat.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <div className="grid grid-cols-2 gap-3">
              {filtered.map(p => {
                const ok = (p.kitchenStatus || 'available') === 'available' && (p.availabilityStatus || 'available') === 'available';
                return (
                  <div key={p.id} onClick={() => ok && addToCart(p)}
                    className={`rounded-[20px] shadow-sm border-2 active:scale-95 flex flex-col min-h-[100px] transition-all ${ok ? 'bg-white border-transparent cursor-pointer' : 'bg-red-50 border-red-200 opacity-60'}`}>
                    {p.image && <ProductImage src={p.image} name={p.name} className="w-full h-20 rounded-t-[18px]" />}
                    <div className="p-3 flex flex-col flex-1 justify-between gap-2 relative">
                      {!ok && <div className="absolute inset-0 flex items-center justify-center z-10 rounded-[20px] bg-red-50/80"><span className="bg-red-600 text-white px-2 py-1 rounded-lg text-[9px] font-black uppercase">N/A</span></div>}
                      <h3 className={`font-bold leading-snug break-words text-xs ${ok ? 'text-gray-800' : 'text-red-400'}`}>{p.name}</h3>
                      <div className="mt-auto flex items-center justify-between gap-1">
                        <span className={`font-black text-sm ${ok ? 'text-orange-600' : 'text-red-400'}`}>{RM(p.price)}</span>
                        {ok && <div className="bg-orange-500 text-white rounded-xl p-1.5"><Plus className="size-3.5" strokeWidth={4} /></div>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        /* ── Checkout ── */
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Cart */}
          <Section title="Your Items">
            {cart.length === 0 ? <p className="text-sm text-gray-400">Cart is empty.</p> : cart.map(item => (
              <div key={item.id} className="bg-orange-50/50 rounded-2xl p-3 border border-orange-100 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-800 text-sm">{item.productName}</h4>
                    {!!item.modifiers?.length && (
                      <p className="text-[11px] text-gray-500">{item.modifiers.map(m => m.optionName).join(', ')}</p>
                    )}
                    <p className="text-orange-600 font-black text-xs">{RM(item.price)}</p>
                  </div>
                  <div className="flex items-center bg-white border-2 border-orange-100 rounded-xl p-1 gap-3">
                    <button onClick={() => setQty(item.id, -1)} className="p-1.5 text-orange-500"><Minus className="size-4" strokeWidth={3} /></button>
                    <span className="font-black text-gray-900 w-5 text-center text-sm">{item.quantity}</span>
                    <button onClick={() => setQty(item.id, 1)} className="p-1.5 text-orange-500"><Plus className="size-4" strokeWidth={3} /></button>
                  </div>
                </div>
                <button onClick={() => setExpandedNotes(expandedNotes === item.id ? null : item.id)} className="flex items-center gap-1 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  <ChevronDown className={`size-3 transition-transform ${expandedNotes === item.id ? 'rotate-180' : ''}`} /> {item.notes ? 'Edit note' : 'Add note (e.g. less sugar, no ice)'}
                </button>
                {expandedNotes === item.id && (
                  <textarea value={item.notes} onChange={e => setNotes(item.id, e.target.value)} placeholder="e.g. Less sugar, no ice, extra spicy…" rows={2}
                    className="w-full text-xs bg-white border border-orange-200 rounded-xl p-2.5 resize-none outline-none focus:ring-2 focus:ring-orange-300" />
                )}
              </div>
            ))}
          </Section>

          {/* Customer info */}
          <Section title="Your Details">
            <Field label="Full Name *"><input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="e.g. Ahmad" /></Field>
            <Field label="Phone Number *"><input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" className={inputCls} placeholder="e.g. 012-3456789" /></Field>
            <Field label="Email (for status updates)" required><input value={email} onChange={e => setEmail(e.target.value)} inputMode="email" type="email" className={inputCls} placeholder="you@email.com" required /></Field>
          </Section>

          {/* Pickup method */}
          <Section title="Pickup Method *">
            <div className="grid grid-cols-3 gap-2">
              {methodBtn('grab', 'Grab Express', Bike)}
              {methodBtn('lalamove', 'Lalamove', Truck)}
              {methodBtn('self', 'Self Pickup', Store)}
            </div>
          </Section>

          {/* Summary */}
          <Section title="Order Summary">
            <Row k="Subtotal" v={RM(subtotal)} />
            <Row k="Tax" v={RM(tax)} />
            <div className="flex justify-between font-black text-gray-900 pt-1 border-t"><span>Total</span><span>{RM(total)}</span></div>
            {method && <p className="text-xs text-gray-500 mt-2">Pickup via <b className="capitalize">{method === 'self' ? 'Self Pickup' : method}</b></p>}
          </Section>

          {/* Payment */}
          <Section title="Payment *">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setPayType('online')} className={`py-3 rounded-2xl border-2 text-sm font-bold ${payType === 'online' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600'}`}>Online Payment</button>
              <button onClick={() => setPayType('cash')} className={`py-3 rounded-2xl border-2 text-sm font-bold ${payType === 'cash' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600'}`}>Pay at Pickup</button>
            </div>

            {payType === 'online' && (
              <div className="mt-3 space-y-3">
                <div className="bg-white border border-gray-200 rounded-2xl p-3 flex flex-col items-center text-center">
                  <p className="text-xs font-bold text-gray-500 mb-2">Scan to pay, then upload your receipt below</p>
                  <img src={merchantQrUrl(branchId)} alt="Payment QR" className="size-44 object-contain"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                </div>
                <label className="flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-orange-300 text-orange-600 font-bold text-sm cursor-pointer">
                  <Upload className="size-4" /> {receipt ? receipt.name : 'Upload Payment Receipt *'}
                  <input type="file" accept="image/*" className="hidden" onChange={e => setReceipt(e.target.files?.[0] ?? null)} />
                </label>
              </div>
            )}
            {payType === 'cash' && <p className="mt-2 text-xs text-gray-500">You'll pay in cash when you collect your order.</p>}
          </Section>

          {/* Notice + acknowledgement */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
            <p className="text-xs text-amber-800">{NOTICE}</p>
            <label className="flex items-center gap-2 mt-3 cursor-pointer">
              <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} className="size-4 accent-orange-500" />
              <span className="text-sm font-bold text-gray-800">I understand</span>
            </label>
          </div>

          {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}

          <button onClick={submit} disabled={submitting || !canSubmit}
            className="w-full bg-orange-500 text-white py-4 rounded-2xl font-black text-base shadow-xl shadow-orange-200 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
            {submitting ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Placing…</> : <><ShoppingBag className="size-5" /> Place Pickup Order · {RM(total)}</>}
          </button>
          <div className="h-4" />
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

const inputCls = 'w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-300';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl p-4 space-y-3">
      <p className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">{title}</p>
      {children}
    </div>
  );
}
function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return <div><label className="block text-xs font-bold text-gray-500 mb-1">{label}{required && <span className="text-red-500"> *</span>}</label>{children}</div>;
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between text-sm text-gray-600"><span>{k}</span><span>{v}</span></div>;
}
