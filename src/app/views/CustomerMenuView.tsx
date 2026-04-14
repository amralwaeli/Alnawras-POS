import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { usePOS } from '../context/POSContext';
import { OrderController } from '../controllers/OrderController';
import { StaffController } from '../controllers/StaffController';
import { 
  Plus, Minus, ShoppingCart, Layers, X, 
  Search, Info, CheckCircle2, ShoppingBag, Utensils
} from 'lucide-react';
import { OrderItem, Product, Table, ROLE_PERMISSIONS } from '../models/types';

interface CartItem {
  id: string;
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  station: 'kitchen' | 'juice' | 'none';
  source: 'existing' | 'new';
  status?: OrderItem['status'];
}

export function CustomerMenuView() {
  const { tableId: urlTableId } = useParams();
  const navigate = useNavigate();
  const {
    products,
    categories: menuCategories,
    tables,
    orders,
    currentUser,
    supabase,
    refreshData
  } = usePOS();

  // ─── STATE ──────────────────────────────────────────────────────────────────
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showTableOverlay, setShowTableOverlay] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(urlTableId || null);
  const [isSending, setIsSending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // ─── INITIALIZATION & SYNC ──────────────────────────────────────────────────
  
  // Load existing items when a table is selected
  useEffect(() => {
    if (!selectedTableId) {
      setCartItems([]);
      return;
    }

    const table = tables.find(t => t.id === selectedTableId);
    if (!table || !table.currentOrderId) {
      setCartItems([]);
      return;
    }

    const order = orders.find(o => o.id === table.currentOrderId);
    if (!order) {
      setCartItems([]);
      return;
    }

    // Map existing order items from DB
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

    // Merge with any "new" items currently in the local cart state
    setCartItems(prev => [
      ...existingItems,
      ...prev.filter(i => i.source === 'new')
    ]);
  }, [selectedTableId, orders, tables]);

  if (!currentUser) return null;

  // ─── COMPUTED ───────────────────────────────────────────────────────────────
  const activeTables = useMemo(() => tables.filter(t => t.currentOrderId || t.status === 'occupied'), [tables]);
  
  const categories = useMemo(() => {
    const ordered = [...(menuCategories || [])].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    return [{ id: 'All', name: 'All' }, ...ordered.map(c => ({ id: c.id, name: c.name }))];
  }, [menuCategories]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const catMatch = selectedCategory === 'All' || p.categoryId === selectedCategory;
      const searchMatch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      const stationMatch = !p.station || ['kitchen', 'juice'].includes(p.station);
      return catMatch && searchMatch && stationMatch && p.isActive;
    });
  }, [products, selectedCategory, searchQuery]);

  const selectedTable = tables.find(t => t.id === selectedTableId);
  const newItemsOnly = cartItems.filter(i => i.source === 'new');
  const existingItemsOnly = cartItems.filter(i => i.source === 'existing');
  const cartTotal = cartItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);

  // ─── HANDLERS ───────────────────────────────────────────────────────────────
  const addToCart = (product: Product) => {
    setCartItems(prev => {
      const existingNew = prev.find(i => i.productId === product.id && i.source === 'new');
      if (existingNew) {
        return prev.map(i => i.id === existingNew.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, {
        id: `new-${Date.now()}`,
        productId: product.id,
        productName: product.name,
        price: product.price,
        quantity: 1,
        station: (product.station as any) || 'kitchen',
        source: 'new'
      }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCartItems(prev => prev.map(i => {
      if (i.id !== id || i.source === 'existing') return i;
      const q = i.quantity + delta;
      return q > 0 ? { ...i, quantity: q } : i;
    }).filter(i => i.quantity > 0));
  };

  const handleSendToKitchen = async () => {
    if (!selectedTableId) {
      setShowTableModal(true);
      return;
    }
    if (newItemsOnly.length === 0) return;

    setIsSending(true);
    try {
      let orderId = selectedTable?.currentOrderId;

      // 1. Create order if it doesn't exist
      if (!orderId) {
        const res = OrderController.createOrder(tables, selectedTableId, currentUser);
        if (!res.success || !res.order) throw new Error(res.error);
        orderId = res.order.id;
        await supabase.from('orders').insert([{ 
          id: orderId, table_id: selectedTableId, table_number: res.order.tableNumber,
          status: 'open', branch_id: currentUser.branchId 
        }]);
        await supabase.from('tables').update({ status: 'occupied', current_order_id: orderId }).eq('id', selectedTableId);
      }

      // 2. Insert ONLY new items
      const payload = newItemsOnly.map(i => ({
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        order_id: orderId, product_id: i.productId, product_name: i.productName,
        quantity: i.quantity, price: i.price, subtotal: i.price * i.quantity,
        station: i.station, status: 'pending', added_by: currentUser.id,
        added_by_name: currentUser.name, branch_id: currentUser.branchId
      }));

      const { error } = await supabase.from('order_items').insert(payload);
      if (error) throw error;

      // 3. Success Feedback
      setShowSuccess(true);
      setTimeout(async () => {
        setShowSuccess(false);
        setSelectedTableId(null); // Reset table selection
        setCartItems([]);         // Clear cart
        await refreshData();      // Force system sync
      }, 2000);

    } catch (e: any) {
      console.error(e.message);
    } finally {
      setIsSending(false);
    }
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen w-full bg-[#EAEEF3] overflow-hidden relative">
      
      {/* Success Animation */}
      {showSuccess && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-white/10 backdrop-blur-[2px] animate-in fade-in duration-300">
          <div className="bg-orange-500 text-white px-12 py-10 rounded-[40px] shadow-2xl flex flex-col items-center gap-4 scale-110 border-4 border-white animate-in zoom-in">
            <div className="bg-white rounded-full p-4"><CheckCircle2 className="size-14 text-orange-500" strokeWidth={3} /></div>
            <div className="text-center"><h2 className="text-3xl font-black uppercase tracking-tighter">Order Sent</h2><p className="text-orange-100 font-bold uppercase text-xs">Kitchen is notified</p></div>
          </div>
        </div>
      )}

      {/* LEFT MENU */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="bg-white p-4 flex items-center justify-between shadow-sm border-b">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
            <input type="text" placeholder="Search products..." className="w-full pl-10 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none ring-1 ring-gray-200" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowTableOverlay(true)} className="flex items-center gap-2 bg-white border px-4 py-2 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all">
              <Layers className="size-4" /> Active Tables ({activeTables.length})
            </button>
            <div className="text-right ml-4">
              <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Waiter</p>
              <p className="text-sm font-bold text-gray-900 leading-none">{currentUser.name}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredProducts.map(p => (
              <div key={p.id} onClick={() => addToCart(p)} className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer border-2 border-transparent active:scale-95 group flex flex-col">
                <div className="relative h-32 bg-gray-50"><img src={p.image || 'https://via.placeholder.com/300'} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="" /></div>
                <div className="p-3 flex flex-col flex-1">
                  <h3 className="text-sm font-bold text-gray-800 line-clamp-2 mb-2 min-h-[2.5rem]">{p.name}</h3>
                  <div className="mt-auto flex items-center justify-between">
                    <span className="text-orange-600 font-black">RM {p.price.toFixed(2)}</span>
                    <div className="bg-orange-500 text-white p-1.5 rounded-lg shadow-sm"><Plus className="size-4" strokeWidth={3} /></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border-t p-3 flex gap-2 overflow-x-auto no-scrollbar">
          {categories.map(cat => (
            <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} className={`px-8 py-4 rounded-2xl font-black whitespace-nowrap transition-all text-sm uppercase ${selectedCategory === cat.id ? 'bg-orange-500 text-white shadow-lg -translate-y-1' : 'bg-gray-100 text-gray-500'}`}>{cat.name}</button>
          ))}
        </div>
      </div>

      {/* RIGHT SIDEBAR */}
      <aside className="w-[380px] bg-white border-l flex flex-col shadow-xl z-10">
        <div className="p-6 bg-orange-500 text-white shadow-lg">
          <div className="flex justify-between items-start">
            <div><p className="text-orange-100 text-[10px] font-bold uppercase tracking-widest">Order Detail</p><h2 className="text-2xl font-black">{selectedTable ? `Table ${selectedTable.number}` : 'No Table'}</h2></div>
            <button onClick={() => setShowTableModal(true)} className="bg-white/20 p-2 rounded-xl hover:bg-white/30 transition-colors"><Plus className="size-5" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {/* History Section */}
          {existingItemsOnly.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2">Bill History</p>
              {existingItemsOnly.map(item => (
                <div key={item.id} className="bg-gray-50 rounded-2xl p-4 border border-dashed border-gray-200 flex items-center gap-3 opacity-80">
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-700 text-xs">{item.productName}</h4>
                    <p className="text-gray-400 font-bold text-[10px]">RM {(item.price * item.quantity).toFixed(2)} • {item.status}</p>
                  </div>
                  <div className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg text-[10px] font-black uppercase">×{item.quantity}</div>
                </div>
              ))}
            </div>
          )}

          {/* New Items Section */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest px-2">New Items</p>
            {newItemsOnly.length === 0 ? (
              <div className="h-32 border-2 border-dashed border-gray-100 rounded-3xl flex flex-col items-center justify-center text-gray-300 italic text-sm"><ShoppingCart className="size-8 mb-1 opacity-20" />Cart empty</div>
            ) : (
              newItemsOnly.map(item => (
                <div key={item.id} className="bg-orange-50 rounded-2xl p-4 border border-orange-100 flex items-center gap-3 animate-in slide-in-from-right-4">
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-800 text-sm">{item.productName}</h4>
                    <p className="text-orange-600 font-bold text-xs">RM {(item.price * item.quantity).toFixed(2)}</p>
                  </div>
                  <div className="flex items-center bg-white rounded-xl border p-1 gap-3 shadow-sm">
                    <button onClick={() => updateQuantity(item.id, -1)} className="p-1 hover:bg-gray-100 rounded-lg text-orange-500"><Minus className="size-4" /></button>
                    <span className="font-black text-gray-800 w-4 text-center">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.id, 1)} className="p-1 hover:bg-gray-100 rounded-lg text-orange-500"><Plus className="size-4" /></button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="p-6 border-t bg-gray-50 space-y-4">
          <div className="flex justify-between items-end mb-2">
            <span className="text-gray-400 font-bold text-xs uppercase tracking-widest leading-none">Total Amount</span>
            <span className="text-2xl font-black text-gray-900 leading-none tracking-tighter">RM {cartTotal.toFixed(2)}</span>
          </div>
          
          <button
            onClick={handleSendToKitchen}
            disabled={isSending || (selectedTableId && newItemsOnly.length === 0)}
            className={`w-full font-black py-4 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-sm
              ${!selectedTableId 
                ? 'bg-orange-500 text-white' 
                : newItemsOnly.length > 0 
                  ? 'bg-orange-500 text-white' 
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
          >
            {isSending ? 'Sending...' : (
              <>
                <ShoppingBag className="size-5" />
                {!selectedTableId ? 'Choose Table' : 'Send to Kitchen'}
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ACTIVE TABLES OVERLAY */}
      {showTableOverlay && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white rounded-[40px] w-full max-w-4xl p-10 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center mb-8">
              <div><h2 className="text-4xl font-black text-gray-900 tracking-tighter">Active Tables</h2><p className="text-gray-400 font-bold uppercase text-xs">Live orders in progress</p></div>
              <button onClick={() => setShowTableOverlay(false)} className="bg-gray-100 p-3 rounded-full hover:bg-gray-200"><X className="size-8" /></button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 overflow-y-auto pr-2 custom-scrollbar">
              {activeTables.map(t => (
                <button key={t.id} onClick={() => { setSelectedTableId(t.id); setShowTableOverlay(false); }} className="p-8 rounded-[35px] border-4 border-orange-100 bg-orange-50 text-left hover:scale-105 transition-all">
                  <div className="flex items-center justify-between mb-4"><Utensils className="size-6 text-orange-500" /><span className="bg-orange-500 text-white text-[10px] px-2 py-1 rounded-full font-black">ACTIVE</span></div>
                  <p className="text-3xl font-black text-gray-800">T-{t.number}</p>
                  <p className="text-[10px] font-bold opacity-60 uppercase mt-1">Capacity: {t.capacity}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TABLE SELECTION MODAL */}
      {showTableModal && (
        <div className="fixed inset-0 z-[101] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-[40px] w-full max-w-2xl p-10 shadow-2xl">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Select Table</h2>
              <button onClick={() => setShowTableModal(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X className="size-6" /></button>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {tables.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setSelectedTableId(t.id); setShowTableModal(false); }}
                  className={`p-6 rounded-3xl border-2 text-left transition-all ${t.status === 'available' ? 'border-emerald-100 bg-emerald-50/50 hover:border-emerald-300' : 'border-orange-100 bg-orange-50/50 hover:border-orange-300'}`}
                >
                  <p className="text-xl font-black text-gray-800">T-{t.number}</p>
                  <p className="text-[10px] font-bold opacity-60 uppercase">{t.status}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`.no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; } .custom-scrollbar::-webkit-scrollbar { width: 5px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }`}</style>
    </div>
  );
}
