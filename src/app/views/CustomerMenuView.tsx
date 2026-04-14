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
  const [orderType, setOrderType] = useState<'dine-in' | 'takeaway'>('dine-in');
  const [isSending, setIsSending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Load existing items ONLY when selecting an existing active table
  useEffect(() => {
    if (!selectedTableId) {
      setCartItems(prev => prev.filter(i => i.source === 'new'));
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

  if (!currentUser) return null;

  // ─── COMPUTED ───────────────────────────────────────────────────────────────
  const activeTables = useMemo(() => tables.filter(t => t.currentOrderId || t.status === 'occupied'), [tables]);
  const availableTables = useMemo(() => tables.filter(t => t.status === 'available'), [tables]);
  
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const catMatch = selectedCategory === 'All' || p.categoryId === selectedCategory;
      const searchMatch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      return catMatch && searchMatch && p.isActive;
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

  const handleSendToKitchen = async (targetTableId?: string) => {
    const finalTableId = targetTableId || selectedTableId;
    if (orderType === 'dine-in' && !finalTableId) {
      setShowTableModal(true);
      return;
    }

    if (newItemsOnly.length === 0) return;

    setIsSending(true);
    try {
      let orderId = tables.find(t => t.id === finalTableId)?.currentOrderId;

      if (!orderId) {
        orderId = `order-${Date.now()}`;
        await supabase.from('orders').insert([{ 
          id: orderId, 
          table_id: orderType === 'dine-in' ? finalTableId : null,
          table_number: orderType === 'dine-in' ? tables.find(t => t.id === finalTableId)?.number : 0,
          status: 'open', 
          branch_id: currentUser.branchId,
          order_type: orderType
        }]);
        if (orderType === 'dine-in') {
          await supabase.from('tables').update({ status: 'occupied', current_order_id: orderId }).eq('id', finalTableId);
        }
      }

      const payload = newItemsOnly.map(i => ({
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        order_id: orderId, product_id: i.productId, product_name: i.productName,
        quantity: i.quantity, price: i.price, subtotal: i.price * i.quantity,
        station: i.station, status: 'pending', added_by: currentUser.id,
        added_by_name: currentUser.name, branch_id: currentUser.branchId
      }));

      await supabase.from('order_items').insert(payload);

      setShowSuccess(true);
      setTimeout(async () => {
        setShowSuccess(false);
        setSelectedTableId(null); 
        setCartItems([]);         
        setOrderType('dine-in');  
        await refreshData();      
      }, 2000);
    } catch (e: any) { console.error(e.message); } 
    finally { setIsSending(false); }
  };

  return (
    <div className="flex h-screen w-full bg-[#EAEEF3] overflow-hidden relative">
      
      {showSuccess && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-white/10 backdrop-blur-[2px] animate-in fade-in duration-300">
          <div className="bg-orange-500 text-white px-12 py-10 rounded-[40px] shadow-2xl flex flex-col items-center gap-4 border-4 border-white animate-in zoom-in">
            <div className="bg-white rounded-full p-4"><CheckCircle2 className="size-14 text-orange-500" strokeWidth={3} /></div>
            <div className="text-center font-black uppercase tracking-tighter"><h2 className="text-3xl">Order Sent</h2><p className="text-orange-100 text-xs">Kitchen Notified</p></div>
          </div>
        </div>
      )}

      {/* LEFT MENU */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="bg-white p-4 flex items-center justify-between shadow-sm border-b">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
            <input type="text" placeholder="Search menu..." className="w-full pl-10 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none ring-1 ring-gray-200" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowTableOverlay(true)} className="flex items-center gap-2 bg-white border px-4 py-2 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all">
              <Layers className="size-4" /> Active Tables ({activeTables.length})
            </button>
            <div className="text-right ml-4">
              <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest leading-none">Waiter</p>
              <p className="text-sm font-bold text-gray-900">{currentUser.name}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredProducts.map(p => (
              <div key={p.id} onClick={() => addToCart(p)} className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer border-2 border-transparent active:scale-95 group flex flex-col">
                <div className="relative h-32 bg-gray-50"><img src={p.image || 'https://via.placeholder.com/300'} className="w-full h-full object-cover group-hover:scale-110 transition-all duration-500" alt="" /></div>
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
          {[{id:'All', name:'ALL'}, ...(menuCategories || [])].map(cat => (
            <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} className={`px-8 py-4 rounded-2xl font-black whitespace-nowrap transition-all text-xs uppercase tracking-widest ${selectedCategory === cat.id ? 'bg-orange-500 text-white shadow-lg -translate-y-1' : 'bg-gray-100 text-gray-500'}`}>{cat.name}</button>
          ))}
        </div>
      </div>

      {/* RIGHT SIDEBAR */}
      <aside className="w-[380px] bg-white border-l flex flex-col shadow-2xl z-10">
        <div className="p-4 bg-orange-500">
          <div className="flex bg-orange-600/30 p-1 rounded-2xl">
            <button onClick={() => { setOrderType('dine-in'); setSelectedTableId(null); }} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs uppercase transition-all ${orderType === 'dine-in' ? 'bg-white text-orange-600 shadow-lg' : 'text-white/70'}`}><Utensils className="size-4" /> Dine-In</button>
            <button onClick={() => { setOrderType('takeaway'); setSelectedTableId(null); }} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs uppercase transition-all ${orderType === 'takeaway' ? 'bg-white text-orange-600 shadow-lg' : 'text-white/70'}`}><ShoppingBag className="size-4" /> Take-Away</button>
          </div>
          {selectedTable && (
            <div className="mt-4 flex items-center justify-between text-white"><span className="text-2xl font-black italic tracking-tighter">TABLE {selectedTable.number}</span><button onClick={() => setSelectedTableId(null)}><X className="size-5" /></button></div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {existingItemsOnly.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2">Bill History</p>
              {existingItemsOnly.map(item => (
                <div key={item.id} className="bg-gray-50 rounded-2xl p-4 border border-dashed border-gray-200 flex items-center gap-3 opacity-60">
                  <div className="flex-1"><h4 className="font-bold text-gray-700 text-xs">{item.productName}</h4><p className="text-[10px] font-bold text-gray-400">RM {(item.price * item.quantity).toFixed(2)} • {item.status}</p></div>
                  <div className="bg-gray-200 text-gray-600 px-2 py-1 rounded-lg text-[10px] font-black uppercase">×{item.quantity}</div>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest px-2">New Selection</p>
            {newItemsOnly.length === 0 ? <div className="h-40 border-2 border-dashed border-gray-100 rounded-[30px] flex flex-col items-center justify-center text-gray-300 italic text-sm">Cart is empty</div> : 
              newItemsOnly.map(item => (
                <div key={item.id} className="bg-orange-50 rounded-2xl p-4 border border-orange-100 flex items-center gap-3">
                  <div className="flex-1"><h4 className="font-bold text-gray-800 text-sm">{item.productName}</h4><p className="text-orange-600 font-bold text-xs">RM {(item.price * item.quantity).toFixed(2)}</p></div>
                  <div className="flex items-center bg-white rounded-xl border p-1 gap-2 shadow-sm">
                    <button onClick={() => setCartItems(prev => prev.map(i => i.id === item.id ? {...i, quantity: Math.max(0, i.quantity - 1)} : i).filter(i => i.quantity > 0))}><Minus className="size-4" /></button>
                    <span className="font-black text-gray-800 w-4 text-center">{item.quantity}</span>
                    <button onClick={() => setCartItems(prev => prev.map(i => i.id === item.id ? {...i, quantity: i.quantity + 1} : i))}><Plus className="size-4" /></button>
                  </div>
                </div>
              ))
            }
          </div>
        </div>

        <div className="p-6 border-t bg-gray-50">
          <div className="flex justify-between items-end mb-4"><span className="text-gray-400 font-bold text-[10px] uppercase tracking-widest">Total</span><span className="text-2xl font-black text-gray-900 tracking-tighter leading-none">RM {cartTotal.toFixed(2)}</span></div>
          <button onClick={() => handleSendToKitchen()} disabled={isSending || newItemsOnly.length === 0} className={`w-full font-black py-4 rounded-2xl shadow-xl transition-all uppercase tracking-widest text-sm flex items-center justify-center gap-3 ${newItemsOnly.length > 0 ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
            <ShoppingBag className="size-5" /> {orderType === 'takeaway' ? 'Send Takeaway' : (selectedTableId ? 'Confirm Order' : 'Choose Table')}
          </button>
        </div>
      </aside>

      {/* MODAL: SELECT TABLE (AVAILABLE ONLY) */}
      {showTableModal && (
        <div className="fixed inset-0 z-[101] bg-black/60 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white rounded-[45px] w-full max-w-2xl p-10 shadow-2xl">
            <div className="flex justify-between items-center mb-8"><h2 className="text-3xl font-black text-gray-900 tracking-tighter uppercase italic">Select Available Table</h2><button onClick={() => setShowTableModal(false)}><X className="size-6" /></button></div>
            <div className="grid grid-cols-3 gap-4">
              {availableTables.length === 0 ? <p className="col-span-3 text-center text-gray-400 py-10 font-bold uppercase">No Available Tables</p> : 
                availableTables.map(t => (
                  <button key={t.id} onClick={() => { handleSendToKitchen(t.id); setShowTableModal(false); }} className="p-6 rounded-[30px] border-2 border-emerald-100 bg-emerald-50/50 hover:border-emerald-500 transition-all text-left">
                    <p className="text-2xl font-black text-gray-800 italic">T-{t.number}</p><p className="text-[10px] font-bold opacity-60 uppercase">Available</p>
                  </button>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {/* OVERLAY: ACTIVE TABLES */}
      {showTableOverlay && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white rounded-[45px] w-full max-w-4xl p-10 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center mb-8"><div><h2 className="text-4xl font-black text-gray-900 tracking-tighter italic uppercase">Active Tables</h2><p className="text-gray-400 font-bold uppercase text-[10px]">Add items to existing bill</p></div><button onClick={() => setShowTableOverlay(false)}><X className="size-8" /></button></div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 overflow-y-auto custom-scrollbar">
              {activeTables.map(t => (
                <button key={t.id} onClick={() => { setSelectedTableId(t.id); setOrderType('dine-in'); setShowTableOverlay(false); }} className="p-8 rounded-[40px] border-4 border-orange-100 bg-orange-50 text-left hover:border-orange-500 transition-all group">
                  <div className="flex items-center justify-between mb-4"><Utensils className="size-6 text-orange-500" /><span className="bg-orange-500 text-white text-[10px] px-2 py-0.5 rounded-full font-black tracking-widest uppercase">Ordered</span></div>
                  <p className="text-3xl font-black text-gray-800 italic group-hover:text-orange-600 transition-colors">T-{t.number}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`.no-scrollbar::-webkit-scrollbar { display: none; } .custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #F97316; border-radius: 10px; }`}</style>
    </div>
  );
}
