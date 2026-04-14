import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { usePOS } from '../context/POSContext';
import { OrderController } from '../controllers/OrderController';
import { StaffController } from '../controllers/StaffController';
import { Plus, Minus, ShoppingCart, Layers, X } from 'lucide-react';
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

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showTableOverlay, setShowTableOverlay] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(tableId || null);
  const [tableForSend, setTableForSend] = useState<string | null>(tableId || null);
  const [isSending, setIsSending] = useState(false);
  const [staffList, setStaffList] = useState<any[]>([]);

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

  if (!currentUser) return null;
  if (!ROLE_PERMISSIONS[currentUser.role].canAddOrders) {
    navigate('/dashboard', { replace: true });
    return null;
  }

  const activeTables = useMemo(() => {
    return tables.filter(table => table.currentOrderId || table.status === 'occupied');
  }, [tables]);

  const categories = useMemo(() => {
    const orderedCategories = menuCategories?.slice().sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    return [
      'All',
      ...(orderedCategories?.map(category => category.name) || []),
    ];
  }, [menuCategories]);

  const filteredProducts = useMemo(() => {
    const visibleProducts = products.filter(product => product.isActive && product.availabilityStatus === 'available');
    return selectedCategory === 'All'
      ? visibleProducts
      : visibleProducts.filter(product => product.category === selectedCategory);
  }, [products, selectedCategory]);

  const selectedTable = tables.find(t => t.id === selectedTableId);
  const selectedTableLabel = selectedTable ? `Table ${selectedTable.number}` : 'No table selected';

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
          id: `cart-new-${product.id}`,
          productId: product.id,
          productName: product.name,
          price: product.price,
          quantity: 1,
          station: product.station,
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

  const handleOpenTableOverlay = () => {
    setShowTableOverlay(true);
  };

  const handleSelectActiveTable = (table: Table) => {
    setSelectedTableId(table.id);
    setTableForSend(table.id);
    setShowTableOverlay(false);
  };

  const assignTableAndSend = async (targetTableId: string) => {
    setTableForSend(targetTableId);
    setShowTableModal(false);
    await handleSendToKitchen(targetTableId);
  };

  const handleSendToKitchen = async (targetTableId?: string) => {
    const tableIdToSend = targetTableId || tableForSend;
    if (!tableIdToSend) {
      setShowTableModal(true);
      return;
    }

    if (cartItems.length === 0) {
      alert('Add items before sending to kitchen.');
      return;
    }

    const targetTable = tables.find(table => table.id === tableIdToSend);
    if (!targetTable) {
      alert('Table not found.');
      return;
    }

    setIsSending(true);
    try {
      let orderId = targetTable.currentOrderId;
      let orderExists = false;

      if (!orderId) {
        const result = OrderController.createOrder(tables, tableIdToSend, currentUser);
        if (!result.success || !result.order) {
          throw new Error(result.error || 'Unable to create order');
        }

        orderId = result.order.id;
        await supabase.from('orders').insert([{ 
          id: orderId,
          table_id: tableIdToSend,
          table_number: result.order.tableNumber,
          subtotal: 0,
          tax: 0,
          discount: 0,
          total: 0,
          status: 'open',
          branch_id: currentUser.branchId,
          created_at: new Date().toISOString(),
        }]);

        await supabase.from('tables').update({ status: 'occupied', current_order_id: orderId })
          .eq('id', tableIdToSend);

        setTables(prev => prev.map(table =>
          table.id === tableIdToSend ? { ...table, status: 'occupied', currentOrderId: orderId } : table
        ));
      } else {
        orderExists = true;
      }

      const itemsToSend = cartItems.filter(item => item.source === 'new');
      if (itemsToSend.length === 0) {
        alert('No new items to send to kitchen.');
        return;
      }

      const insertPayload = itemsToSend.map(item => ({
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
        added_at: new Date().toISOString(),
        branch_id: currentUser.branchId,
      }));

      const { error: itemError, data: insertedItems } = await supabase
        .from('order_items')
        .insert(insertPayload)
        .select('*');

      if (itemError) {
        throw new Error(itemError.message);
      }

      setCartItems(current => [
        ...current.filter(item => item.source === 'existing'),
        ...(insertedItems || []).map((row: any) => ({
          id: row.id,
          productId: row.product_id,
          productName: row.product_name,
          price: row.price,
          quantity: row.quantity,
          station: row.station,
          source: 'existing' as const,
          status: row.status,
          orderItemId: row.id,
        })),
      ]);

      if (!orderExists) {
        const createdOrder = orders.find(o => o.id === orderId);
        if (createdOrder) {
          setOrders(prev => [...prev.filter(o => o.id !== orderId), createdOrder]);
        }
      }

      setShowTableModal(false);
      alert(`Sent ${itemsToSend.length} item(s) to kitchen for ${selectedTableLabel}.`);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : 'Failed to send to kitchen');
    } finally {
      setIsSending(false);
    }
  };

  const cartTotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const statusStyle = (status?: OrderItem['status']) => {
    if (status === 'ready') return 'bg-emerald-100 text-emerald-800';
    if (status === 'preparing') return 'bg-orange-100 text-orange-800';
    if (status === 'served') return 'bg-slate-100 text-slate-700';
    return 'bg-amber-100 text-amber-900';
  };

  return (
    <div className="h-screen overflow-hidden bg-orange-50">
      <div className="flex items-center justify-between gap-4 px-6 py-4 bg-white shadow-sm">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-orange-600">Waiter POS</p>
          <h1 className="text-3xl font-bold text-slate-900">{selectedTableLabel}</h1>
          <p className="mt-1 text-sm text-slate-500">Tap products to build the order instantly.</p>
          {staffList.length > 0 && (
            <p className="mt-2 text-sm text-slate-500">Active staff: {staffList.length}</p>
          )}
        </div>

        <button
          onClick={handleOpenTableOverlay}
          className="inline-flex items-center gap-2 rounded-2xl bg-orange-500 px-5 py-3 text-white shadow-lg shadow-orange-200 hover:bg-orange-600 transition"
        >
          <Layers className="h-5 w-5" />
          Active Tables
        </button>
      </div>

      <div className="flex h-[calc(100vh-76px)] overflow-hidden px-6 py-4 gap-4">
        <section className="basis-[70%] flex flex-col gap-4 overflow-hidden">
          <div className="flex gap-2 overflow-x-auto rounded-2xl bg-white p-3 shadow-sm">
            {categories.map(category => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`min-w-max rounded-full px-4 py-2 text-sm font-semibold transition ${
                  selectedCategory === category
                    ? 'bg-orange-500 text-white shadow-lg'
                    : 'bg-orange-100 text-orange-800 hover:bg-orange-200'
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 overflow-auto pr-2">
            {filteredProducts.length === 0 ? (
              <div className="col-span-full rounded-2xl border border-dashed border-orange-200 bg-white p-8 text-center text-slate-500">
                No products found
              </div>
            ) : (
              filteredProducts.map(product => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className="relative h-40 overflow-hidden bg-slate-100">
                    <img
                      src={product.image || 'https://via.placeholder.com/400x300?text=No+Image'}
                      alt={product.name}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                  </div>
                  <div className="flex flex-1 flex-col justify-between p-4 text-left">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">{product.name}</h3>
                      <p className="mt-2 text-sm text-slate-500 min-h-[3rem]">{product.category}</p>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-orange-700">RM {product.price.toFixed(2)}</span>
                      <span className="inline-flex items-center rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-800">
                        Add
                        <Plus className="ml-2 h-3.5 w-3.5" />
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <aside className="basis-[30%] flex flex-col rounded-2xl bg-white p-5 shadow-lg">
          <div className="mb-4 rounded-2xl bg-orange-500 px-4 py-5 text-white shadow-inner">
            <h2 className="text-xl font-semibold">Current Cart</h2>
            <p className="mt-1 text-sm text-orange-100">{selectedTableLabel}</p>
          </div>

          <div className="flex-1 space-y-3 overflow-auto pr-2">
            {cartItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-orange-200 p-6 text-center text-slate-500">
                Add items to the cart to start the order.
              </div>
            ) : (
              cartItems.map(item => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-base font-semibold text-slate-900">{item.productName}</h3>
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusStyle(item.status)}`}>
                          {item.status ?? 'sent'}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">RM {(item.price * item.quantity).toFixed(2)}</p>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <div className="inline-flex items-center rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-700 shadow-sm">
                        {item.quantity}
                      </div>
                      {item.source === 'new' ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => updateQuantity(item.id, -1)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-orange-600 shadow-sm"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => updateQuantity(item.id, 1)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-sm"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">Existing</div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-orange-100 bg-orange-50 p-4">
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Subtotal</span>
              <span>RM {cartTotal.toFixed(2)}</span>
            </div>
            <div className="mt-3 flex flex-col gap-3">
              <button
                onClick={() => setShowTableModal(true)}
                className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-3 text-orange-700 shadow-sm hover:bg-orange-100"
              >
                Select Table
              </button>
              <button
                onClick={() => handleSendToKitchen()}
                disabled={cartItems.filter(item => item.source === 'new').length === 0 || isSending}
                className="inline-flex items-center justify-center rounded-2xl bg-orange-500 px-4 py-4 text-white shadow-lg hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ShoppingCart className="mr-2 h-5 w-5" />
                Send to Kitchen
              </button>
            </div>
          </div>
        </aside>
      </div>

      {showTableOverlay && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 p-6">
          <div className="mx-auto flex h-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-4 pb-4">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">Open Tables</h2>
                <p className="text-sm text-slate-500">Select a live table to load its current items.</p>
              </div>
              <button
                onClick={() => setShowTableOverlay(false)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 overflow-auto">
              {activeTables.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
                  No active tables right now.
                </div>
              ) : (
                activeTables.map(table => {
                  const openOrder = orders.find(order => order.id === table.currentOrderId);
                  return (
                    <button
                      key={table.id}
                      onClick={() => handleSelectActiveTable(table)}
                      className="rounded-3xl border border-orange-200 bg-orange-50 p-6 text-left transition hover:-translate-y-1 hover:bg-orange-100"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-2xl font-bold text-slate-900">Table {table.number}</span>
                        <span className="rounded-full bg-orange-500 px-3 py-1 text-xs font-semibold text-white">Open</span>
                      </div>
                      <p className="mt-3 text-sm text-slate-600">{openOrder?.items.length ?? 0} item(s)</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {openOrder?.items.slice(0, 3).map(item => (
                          <span key={item.id} className="rounded-full bg-white px-3 py-1 text-xs text-slate-700 shadow-sm">
                            {item.quantity}x {item.productName}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {showTableModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 p-6">
          <div className="mx-auto max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-4 pb-4">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">Choose a Table</h2>
                <p className="text-sm text-slate-500">Assign the cart to a table before sending it.</p>
              </div>
              <button
                onClick={() => setShowTableModal(false)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {tables.map(table => (
                <button
                  key={table.id}
                  onClick={() => assignTableAndSend(table.id)}
                  className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-left transition hover:bg-slate-100"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-lg font-semibold">Table {table.number}</span>
                    <span className="rounded-full px-3 py-1 text-xs font-semibold text-slate-700 bg-white shadow-sm">
                      {table.status === 'available' ? 'Available' : table.status === 'occupied' ? 'Occupied' : 'Reserved'}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">Capacity: {table.capacity}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
