import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Product, Category, Table, Order, OrderItem } from '../../models/types';
import { mapOrder } from '../../models/mappers';
import { OrderController } from '../../controllers/OrderController';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Search,
  ShoppingCart,
  Plus,
  Minus,
  CheckCircle2,
  Bell,
  X,
} from 'lucide-react';

interface CartItem {
  id: string;
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  notes: string;
}

function formatCurrency(value: number) {
  return `RM ${value.toFixed(2)}`;
}

export function TableOrderingView() {
  const { tableId } = useParams();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [table, setTable] = useState<Table | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [invalidTable, setInvalidTable] = useState(false);
  const [callingWaiter, setCallingWaiter] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!tableId) {
        setInvalidTable(true);
        setLoading(false);
        return;
      }

      setLoading(true);
      setInvalidTable(false);

      const { data: tableRow, error: tableError } = await supabase
        .from('tables')
        .select('*')
        .eq('id', tableId)
        .single();

      if (tableError || !tableRow) {
        setInvalidTable(true);
        setLoading(false);
        return;
      }

      const branchId = tableRow.branch_id;
      setTable({
        id: tableRow.id,
        number: tableRow.number,
        capacity: tableRow.capacity,
        status: tableRow.status,
        branchId,
        currentOrderId: tableRow.current_order_id,
        assignedCashierId: tableRow.assigned_cashier_id,
        needsWaiter: tableRow.needs_waiter ?? false,
      });

      const [productsRes, categoriesRes] = await Promise.all([
        supabase.from('products').select('*').eq('branch_id', branchId).eq('is_active', true).order('name'),
        supabase.from('categories').select('*').eq('branch_id', branchId).order('display_order'),
      ]);

      if (productsRes.error || !productsRes.data) {
        toast.error('Failed to load menu. Please try again.');
      } else {
        setProducts(productsRes.data.map((product: any) => ({
          ...product,
          price: Number(product.price),
          taxRate: Number(product.tax_rate ?? 0),
          categoryId: product.category_id,
        })));
      }

      if (categoriesRes.error || !categoriesRes.data) {
        setCategories([]);
      } else {
        setCategories(categoriesRes.data.map((category: any) => ({
          ...category,
          displayOrder: Number(category.display_order ?? 0),
        })));
      }

      const orderQuery = tableRow.current_order_id
        ? supabase.from('orders').select('*, order_items(*)').eq('id', tableRow.current_order_id).single()
        : supabase.from('orders').select('*, order_items(*)').eq('table_id', tableId).eq('status', 'open').maybeSingle();

      const { data: orderData } = await orderQuery;

      if (orderData) {
        setOrder(mapOrder(orderData));
      }

      await ensureQrSession(tableId, branchId);
      setLoading(false);
    };

    void load();
  }, [tableId]);

  const ensureQrSession = async (tableId: string, branchId: string) => {
    try {
      const { data: existing } = await supabase.from('qr_sessions').select('*').eq('table_id', tableId).single();
      if (existing) {
        await supabase
          .from('qr_sessions')
          .update({ active: true, last_activity_at: new Date().toISOString() })
          .eq('table_id', tableId);
      } else {
        await supabase.from('qr_sessions').insert([{ id: `qr-session-${tableId}`, table_id: tableId, active: true, started_at: new Date().toISOString(), last_activity_at: new Date().toISOString(), branch_id: branchId }]);
      }
    } catch (err) {
      console.warn('[QR Session] Could not create session', err);
    }
  };

  const filteredProducts = useMemo(() => {
    const activeCategory = categories.find(c => c.id === selectedCategory);

    return products.filter(p => {
      const categoryMatch = selectedCategory
        ? p.categoryId === selectedCategory || (!!activeCategory && p.category?.toLowerCase() === activeCategory.name.toLowerCase())
        : true;
      const searchMatch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      return categoryMatch && searchMatch;
    });
  }, [products, categories, selectedCategory, searchQuery]);

  const existingItems = order?.items || [];
  const newItems = cartItems;
  const combinedItems = [...existingItems, ...newItems.map(item => ({
    ...item,
    status: 'pending',
  }))];

  const billSubtotal = combinedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const billTax = 0; // tax not yet applied in first release
  const billTotal = billSubtotal + billTax;

  const addToCart = (product: Product) => {
    setCartItems(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        return prev.map(item => item.id === existing.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { id: `cart-${Date.now()}`, productId: product.id, productName: product.name, price: product.price, quantity: 1, notes: '' }];
    });
  };

  const updateCartItem = (itemId: string, quantity: number) => {
    setCartItems(prev => prev
      .map(item => item.id === itemId ? { ...item, quantity: Math.max(1, quantity) } : item)
      .filter(item => item.quantity > 0)
    );
  };

  const updateCartNotes = (itemId: string, notes: string) => {
    setCartItems(prev => prev.map(item => item.id === itemId ? { ...item, notes } : item));
  };

  const handleRemoveCartItem = (itemId: string) => {
    setCartItems(prev => prev.filter(item => item.id !== itemId));
  };

  const handleCallWaiter = async () => {
    if (!table) return;
    setCallingWaiter(true);
    const { error } = await supabase.from('tables').update({ needs_waiter: true }).eq('id', table.id);
    if (error) {
      toast.error('Unable to request a waiter. Please try again.');
    } else {
      setTable(prev => prev ? { ...prev, needsWaiter: true } : prev);
      toast.success('A waiter has been notified.');
    }
    setCallingWaiter(false);
  };

  const handleCheckout = async () => {
    if (!table || cartItems.length === 0) {
      toast.error('Add items before submitting the order.');
      return;
    }

    setSubmitting(true);

    try {
      const result = await OrderController.submitOrder({
        branchId: table.branchId,
        orderType: 'dine-in',
        table: { id: table.id, number: table.number },
        existingOrderId: order?.id || table.currentOrderId,
        items: cartItems.map(item => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          price: item.price,
          notes: item.notes,
        })),
        addedBy: currentUser?.id ?? 'guest',
        addedByName: currentUser?.name ?? 'Guest',
        waiterId: currentUser?.id,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      setOrder(result.data);
      setTable(prev => prev ? { ...prev, status: 'occupied', currentOrderId: result.data.id } : prev);
      setCartItems([]);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } finally {
      setSubmitting(false);
    }
  };

  const orderNumber = order?.id ? order.id.split('-').pop() : 'NEW';

  if (invalidTable) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-10">
        <div className="max-w-xl w-full bg-white rounded-3xl shadow-xl p-10 text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-orange-500 font-black mb-4">Invalid QR link</p>
          <h1 className="text-3xl font-extrabold text-slate-900 mb-4">Sorry, this table code isn’t valid.</h1>
          <p className="text-sm text-slate-500 mb-8">Please ask a team member for a fresh QR code or scan the correct table QR.</p>
          <button onClick={() => navigate('/')} className="px-6 py-3 rounded-full bg-orange-500 text-white font-bold hover:bg-orange-600 transition">Go to Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 mb-6">
          <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-slate-700 hover:text-orange-600">
            <ArrowLeft className="size-5" /> Back
          </button>
          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Table</p>
            <p className="text-3xl font-extrabold text-slate-900">{table ? `T-${table.number}` : 'Loading...'}</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.8fr_1fr]">
          <div className="space-y-6">
            <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400 mb-2">Welcome to our table ordering</p>
                  <h2 className="text-2xl font-extrabold text-slate-900">Scan. Tap. Order.</h2>
                </div>
                <button onClick={handleCallWaiter} disabled={callingWaiter} className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-5 py-3 text-sm font-bold text-white hover:bg-orange-600 transition disabled:opacity-60">
                  <Bell className="size-4" /> {table?.needsWaiter ? 'Waiter Requested' : 'Call Waiter'}
                </button>
              </div>
              {table?.needsWaiter && <p className="mt-4 text-sm text-orange-700">A waiter has been notified for this table.</p>}
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
              <div className="rounded-3xl bg-white p-4 shadow-sm border border-slate-200">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400 mb-3">Order</p>
                <p className="text-lg font-bold text-slate-900">{order ? 'Open bill' : 'New order'}</p>
                <p className="text-sm text-slate-500 mt-2">Bill #: <span className="font-semibold text-slate-900">{orderNumber}</span></p>
              </div>
              <div className="rounded-3xl bg-white p-4 shadow-sm border border-slate-200">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Status</p>
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${order ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                    {order ? 'Open and active' : 'Ready to order'}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-500">You can add items anytime until the bill is closed.</p>
              </div>
            </div>

            <div className="rounded-3xl bg-white p-4 shadow-sm border border-slate-200">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-slate-100 p-3 text-orange-500"><ShoppingCart className="size-5" /></div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Menu</p>
                    <p className="text-xl font-bold text-slate-900">Choose items to add to your bill</p>
                  </div>
                </div>
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search menu..."
                    className="w-full rounded-full border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 outline-none focus:border-orange-300"
                  />
                </div>
              </div>

              <div className="mt-5 flex gap-2 overflow-x-auto pb-2">
                <button
                  onClick={() => setSelectedCategory('')}
                  className={`rounded-full border px-4 py-2 text-xs font-bold transition ${selectedCategory === '' ? 'bg-orange-500 text-white' : 'bg-white text-slate-700 border-slate-200'}`}
                >
                  All
                </button>
                {categories.map(category => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={`rounded-full border px-4 py-2 text-xs font-bold transition ${selectedCategory === category.id ? 'bg-orange-500 text-white' : 'bg-white text-slate-700 border-slate-200'}`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map(product => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addToCart(product)}
                  className="group rounded-[32px] border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{product.name}</p>
                      <p className="mt-3 text-sm text-slate-500 line-clamp-2">{product.image ? 'Tap to add' : 'Add to cart'}</p>
                    </div>
                    <span className="rounded-2xl bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{formatCurrency(product.price)}</span>
                  </div>
                  <div className="mt-5 flex items-center justify-between text-xs text-slate-400">
                    <span>{product.kitchen_status === 'available' ? 'Available' : 'Unavailable'}</span>
                    <span>{product.category}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Current bill</p>
                  <p className="text-2xl font-extrabold text-slate-900">{formatCurrency(billTotal)}</p>
                </div>
                <div className="rounded-3xl bg-slate-100 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-700">{table?.status === 'occupied' ? 'Occupied' : 'Available'}</div>
              </div>
              <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-2">
                {existingItems.length === 0 && newItems.length === 0 && (
                  <p className="text-sm text-slate-500">Your order is empty. Add items from the menu.</p>
                )}
                {existingItems.map(item => (
                  <div key={item.id} className="rounded-3xl bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-slate-900">{item.productName}</p>
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-400 mt-1">Status: {item.status}</p>
                      </div>
                      <span className="text-sm font-semibold text-slate-900">{formatCurrency(item.subtotal)}</span>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">Qty: {item.quantity}</p>
                  </div>
                ))}
                {newItems.map(item => (
                  <div key={item.id} className="rounded-3xl bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-slate-900">{item.productName}</p>
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-400 mt-1">New item</p>
                      </div>
                      <span className="text-sm font-semibold text-slate-900">{formatCurrency(item.price * item.quantity)}</span>
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      <button onClick={() => updateCartItem(item.id, item.quantity - 1)} className="rounded-full border border-slate-300 p-2 text-slate-600"><Minus className="size-4" /></button>
                      <span className="font-bold text-slate-900">{item.quantity}</span>
                      <button onClick={() => updateCartItem(item.id, item.quantity + 1)} className="rounded-full border border-slate-300 p-2 text-slate-600"><Plus className="size-4" /></button>
                      <button onClick={() => handleRemoveCartItem(item.id)} className="ml-auto text-xs uppercase text-slate-400 hover:text-orange-600">Remove</button>
                    </div>
                    <textarea
                      value={item.notes}
                      onChange={e => updateCartNotes(item.id, e.target.value)}
                      placeholder="Add notes for kitchen"
                      className="mt-4 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-orange-300"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200 space-y-4">
              <div className="flex items-center justify-between text-sm text-slate-500">
                <span>Subtotal</span>
                <span>{formatCurrency(billSubtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-500">
                <span>Tax</span>
                <span>{formatCurrency(billTax)}</span>
              </div>
              <div className="flex items-center justify-between text-lg font-bold text-slate-900 border-t border-slate-200 pt-4">
                <span>Total</span>
                <span>{formatCurrency(billTotal)}</span>
              </div>
              <button
                onClick={handleCheckout}
                disabled={submitting || cartItems.length === 0}
                className={`w-full rounded-3xl px-5 py-4 text-sm font-black uppercase tracking-[0.2em] transition ${cartItems.length > 0 ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}`}
              >
                {submitting ? 'Sending...' : order ? 'Add more items' : 'Submit order'}
              </button>
            </div>
          </aside>
        </div>
      </div>

      {success && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-[40px] bg-white p-8 shadow-2xl border border-slate-200 text-center">
            <div className="mx-auto mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="size-10" />
            </div>
            <h2 className="text-3xl font-extrabold text-slate-900 mb-2">Order submitted</h2>
            <p className="text-sm text-slate-500 mb-6">Your order is on its way to the kitchen. You can continue adding items if needed.</p>
            <button onClick={() => setSuccess(false)} className="rounded-full bg-orange-500 px-6 py-3 text-sm font-bold uppercase text-white hover:bg-orange-600 transition">Add more items</button>
          </div>
        </div>
      )}
    </div>
  );
}