import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { usePOS } from '../context/POSContext';
import { OrderController } from '../controllers/OrderController';
import { StaffController } from '../controllers/StaffController';
import { 
  Plus, Minus, ShoppingCart, Layers, X, 
  Search, Info, CheckCircle2, AlertCircle 
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
  orderItemId?: string;
  image?: string;
}

export function CustomerMenuView() {
  const { tableId } = useParams();
  const navigate = useNavigate();
  const {
    products,
    categories: menuCategories,
    tables,
    orders,
    currentUser,
    setOrders,
    setTables,
    supabase,
  } = usePOS();

  // ─── STATE ──────────────────────────────────────────────────────────────────
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showTableOverlay, setShowTableOverlay] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(tableId || null);
  const [tableForSend, setTableForSend] = useState<string | null>(tableId || null);
  const [isSending, setIsSending] = useState(false);
  const [staffList, setStaffList] = useState<any[]>([]);

  // ─── INITIALIZATION ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    StaffController.getStaff(true).then(result => {
      if (result.success && result.data) {
        setStaffList(result.data);
      }
    });
  }, [currentUser]);

  useEffect(() => {
    if (tableId) {
      setSelectedTableId(tableId);
      setTableForSend(tableId);
    }
  }, [tableId]);

  // Load existing items if table is occupied
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

    const existingCart = order.items.map(item => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      price: item.price,
      quantity: item.quantity,
      station: item.station,
      source: 'existing' as const,
      status: item.status,
      orderItemId: item.id,
    }));

    setCartItems(existingCart);
  }, [selectedTableId, orders, tables]);

  // ─── PERMISSIONS ────────────────────────────────────────────────────────────
  if (!currentUser) return null;
  if (!ROLE_PERMISSIONS[currentUser.role].canAddOrders) {
    navigate('/dashboard', { replace: true });
    return null;
  }

  // ─── COMPUTED DATA ──────────────────────────────────────────────────────────
  const activeTables = useMemo(() => {
    return tables.filter(table => table.currentOrderId || table.status === 'occupied');
  }, [tables]);

  const categories = useMemo(() => {
    const orderedCategories = [...(menuCategories || [])].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    return [
      { id: 'All', name: 'All' },
      ...orderedCategories.map(cat => ({ id: cat.id, name: cat.name }))
    ];
  }, [menuCategories]);

  // FIX: The core filtering logic that was causing the empty grid
  const filteredProducts = useMemo(() => {
    console.log(`Grid Refresh: ${products.length} products, Category: ${selectedCategory}`);

    return products.filter(product => {
      // 1. Category Filter: UUID vs 'All'
      const matchesCategory = selectedCategory === 'All' || product.categoryId === selectedCategory;
      
      // 2. Search Filter
      const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase());

      // 3. Station Logic: Requirement (kitchen | juice | null)
      const matchesStation = !product.station || ['kitchen', 'juice'].includes(product.station);
      
      // 4. Visibility Logic: isActive and Availability
      const isVisible = product.isActive !== false && 
                        (product.availabilityStatus || 'available') === 'available';

      return matchesCategory && matchesSearch && matchesStation && isVisible;
    });
  }, [products, selectedCategory, searchQuery]);

  const selectedTable = tables.find(t => t.id === selectedTableId);
  const selectedTableLabel = selectedTable ? `Table ${selectedTable.number}` : 'Select Table';

  // ─── CART ACTIONS ───────────────────────────────────────────────────────────
  const addToCart = (product: Product) => {
    setCartItems(current => {
      const existingNew = current.find(item => item.productId === product.id && item.source === 'new');
      if (existingNew) {
        return current.map(item =>
          item.id === existingNew.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }

      return [
        ...current,
        {
          id: `cart-new-${product.id}-${Date.now()}`,
          productId: product.id,
          productName: product.name,
          price: product.price,
          quantity: 1,
          station: (product.station as any) || 'kitchen',
          source: 'new' as const,
          image: product.image,
        },
      ];
    });
  };

  const updateQuantity = (cartItemId: string, change: number) => {
    setCartItems(current => current
      .map(item => {
        if (item.id !== cartItemId) return item;
        if (item.source === 'existing') return item;
        const nextQty = item.quantity + change;
        return nextQty > 0 ? { ...item, quantity: nextQty } : item;
      })
      .filter(item => item.quantity > 0)
    );
  };

  const removeFromCart = (cartItemId: string) => {
    setCartItems(current => current.filter(item => item.id !== cartItemId));
  };

  // ─── ORDER SUBMISSION ───────────────────────────────────────────────────────
  const handleSendToKitchen = async (targetTableId?: string) => {
    const tableIdToSend = targetTableId || tableForSend;
    if (!tableIdToSend) {
      setShowTableModal(true);
      return;
    }

    const itemsToSend = cartItems.filter(item => item.source === 'new');
    if (itemsToSend.length === 0) return;

    setIsSending(true);
    try {
      let orderId = tables.find(t => t.id === tableIdToSend)?.currentOrderId;
      
      // Create order if table is new
      if (!orderId) {
        const result = OrderController.createOrder(tables, tableIdToSend, currentUser);
        if (!result.success || !result.order) throw new Error(result.error);

        orderId = result.order.id;
        await supabase.from('orders').insert([{ 
          id: orderId,
          table_id: tableIdToSend,
          table_number: result.order.tableNumber,
          status: 'open',
          branch_id: currentUser.branchId,
        }]);

        await supabase.from('tables').update({ status: 'occupied', current_order_id: orderId }).eq('id', tableIdToSend);
      }

      // Insert Items
      const insertPayload = itemsToSend.map(item => ({
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        order_id: orderId,
        product_id: item.productId,
        product_name: item.productName,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.price * item.quantity,
        station: item.station,
        status: 'pending',
        added_by: currentUser.id,
        added_by_name: currentUser.name,
        branch_id: currentUser.branchId,
      }));

      await supabase.from('order_items').insert(insertPayload);
      
      alert('Order sent successfully!');
    } catch (error: any) {
      alert(error.message || 'Failed to send order');
    } finally {
      setIsSending(false);
    }
  };

  const cartTotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen w-full bg-[#EAEEF3] overflow-hidden">
      
      {/* LEFT: Product Menu Section */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top bar with Search */}
        <div className="bg-white p-4 flex items-center justify-between shadow-sm border-b">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search products..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none border-none ring-1 ring-gray-200"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowTableOverlay(true)}
              className="flex items-center gap-2 bg-white border px-4 py-2 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all"
            >
              <Layers className="size-4" />
              Active Tables ({activeTables.length})
            </button>
            <div className="h-8 w-px bg-gray-200 mx-1" />
            <div className="text-right">
              <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wider">Waiter</p>
              <p className="text-sm font-bold text-gray-900 leading-none">{currentUser.name}</p>
            </div>
          </div>
        </div>

        {/* Product Grid Area */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {filteredProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-50">
              <ShoppingCart className="size-16 mb-2" />
              <p className="text-lg font-bold uppercase tracking-widest">Grid Empty</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer border-2 border-transparent active:scale-95 group flex flex-col"
                >
                  <div className="relative h-32 bg-gray-50">
                    <img 
                      src={product.image || 'https://via.placeholder.com/300x200?text=No+Image'} 
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                    />
                  </div>
                  <div className="p-3 flex flex-col flex-1">
                    <h3 className="text-sm font-bold text-gray-800 line-clamp-2 leading-tight mb-2 min-h-[2.5rem]">
                      {product.name}
                    </h3>
                    <div className="mt-auto flex items-center justify-between">
                      <span className="text-orange-600 font-black">RM {product.price.toFixed(2)}</span>
                      <div className="bg-orange-500 text-white p-1.5 rounded-lg shadow-sm">
                        <Plus className="size-4" strokeWidth={3} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Category Navigation (As seen in design) */}
        <div className="bg-white border-t p-3 flex gap-2 overflow-x-auto no-scrollbar shadow-[0_-4px_10px_rgba(0,0,0,0.03)]">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-8 py-4 rounded-2xl font-black whitespace-nowrap transition-all text-sm uppercase tracking-wider
                ${selectedCategory === cat.id 
                  ? 'bg-orange-500 text-white shadow-lg shadow-orange-200 -translate-y-1' 
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* RIGHT: Cart / Sidebar Section */}
      <aside className="w-[380px] bg-white border-l flex flex-col shadow-xl z-10">
        {/* Header */}
        <div className="p-6 bg-orange-500 text-white shadow-lg">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-orange-100 text-[10px] font-bold uppercase tracking-widest">Order Detail</p>
              <h2 className="text-2xl font-black">{selectedTableLabel}</h2>
            </div>
            <button 
              onClick={() => setShowTableModal(true)}
              className="bg-orange-400 p-2 rounded-xl hover:bg-orange-600 transition-colors"
            >
              <Plus className="size-5" />
            </button>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <span className="bg-orange-600/50 px-3 py-1 rounded-full text-[10px] font-bold uppercase">
              Items: {cartItems.length}
            </span>
            <span className="bg-orange-600/50 px-3 py-1 rounded-full text-[10px] font-bold uppercase">
              Total: RM {cartTotal.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {cartItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-300 italic">
              <ShoppingCart className="size-12 mb-2 opacity-20" />
              <p>Cart is empty</p>
            </div>
          ) : (
            cartItems.map((item) => (
              <div key={item.id} className="bg-gray-50 rounded-2xl p-4 border border-gray-100 flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-bold text-gray-800 text-sm">{item.productName}</h4>
                    {item.source === 'existing' && (
                      <CheckCircle2 className="size-3 text-emerald-500" />
                    )}
                  </div>
                  <p className="text-orange-600 font-bold text-xs">RM {item.price.toFixed(2)}</p>
                </div>
                
                {item.source === 'new' ? (
                  <div className="flex items-center bg-white rounded-xl border p-1 gap-3 shadow-sm">
                    <button onClick={() => updateQuantity(item.id, -1)} className="p-1.5 hover:bg-gray-100 rounded-lg text-orange-500">
                      <Minus className="size-4" strokeWidth={3} />
                    </button>
                    <span className="font-black text-gray-800 w-4 text-center">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.id, 1)} className="p-1.5 hover:bg-gray-100 rounded-lg text-orange-500">
                      <Plus className="size-4" strokeWidth={3} />
                    </button>
                  </div>
                ) : (
                  <div className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg text-[10px] font-bold uppercase">
                    Ordered ×{item.quantity}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t bg-gray-50 space-y-4">
          <div className="flex justify-between items-end mb-2">
            <span className="text-gray-400 font-bold text-xs uppercase tracking-widest">Subtotal</span>
            <span className="text-2xl font-black text-gray-900 leading-none">RM {cartTotal.toFixed(2)}</span>
          </div>
          
          <button
            onClick={() => handleSendToKitchen()}
            disabled={cartItems.filter(i => i.source === 'new').length === 0 || isSending}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 text-white font-black py-4 rounded-2xl shadow-lg shadow-orange-200 transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-sm"
          >
            {isSending ? 'Sending...' : (
              <>
                <ShoppingCart className="size-5" />
                Send to Kitchen
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ─── MODALS ─── */}
      {/* Table Selection Modal (Your original logic) */}
      {showTableModal && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="bg-white rounded-[40px] w-full max-w-2xl p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-black text-gray-900">Choose Table</h2>
              <button onClick={() => setShowTableModal(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200">
                <X className="size-6" />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {tables.map(table => (
                <button
                  key={table.id}
                  onClick={() => { setTableForSend(table.id); setSelectedTableId(table.id); setShowTableModal(false); }}
                  className={`p-6 rounded-3xl border-2 text-left transition-all
                    ${table.status === 'available' ? 'border-emerald-100 bg-emerald-50/50' : 'border-orange-100 bg-orange-50/50'}`}
                >
                  <p className="text-2xl font-black text-gray-800">T-{table.number}</p>
                  <p className="text-xs font-bold opacity-60 uppercase">{table.status}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Styled Overlay CSS */}
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }
      `}</style>
    </div>
  );
}
