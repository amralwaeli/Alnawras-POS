import { useState, useEffect } from 'react';
import { useParams } from 'react-router';
import { supabase } from '../../lib/supabase';
import { OrderController } from '../controllers/OrderController';
import { Plus, Minus, ShoppingCart, Receipt, X } from 'lucide-react';
import { Product } from '../models/types';

interface CartItem {
  product: Product;
  quantity: number;
}

export function CustomerMenuView() {
  const { tableId } = useParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showBill, setShowBill] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');

  useEffect(() => {
    const load = async () => {
      const [{ data: prods }, { data: tbls }, { data: ords }] = await Promise.all([
        supabase.from('products').select('*').eq('branch_id', 'branch-1').eq('is_active', true),
        supabase.from('tables').select('*').eq('branch_id', 'branch-1'),
        supabase.from('orders').select('*, order_items(*)').eq('branch_id', 'branch-1').eq('status', 'open'),
      ]);
      if (prods) setProducts(prods.map((p: any) => ({
        ...p, isActive: p.is_active, kitchenStatus: p.kitchen_status ?? 'available',
        categoryId: p.category_id, createdAt: p.created_at,
      })));
      if (tbls) setTables(tbls.map((t: any) => ({
        ...t, currentOrderId: t.current_order_id, assignedCashierId: t.assigned_cashier_id,
      })));
      if (ords) setOrders(ords.map((o: any) => ({
        ...o, items: (o.order_items || []).map((i: any) => ({
          ...i, productName: i.product_name, addedBy: i.added_by, addedByName: i.added_by_name,
        })),
      })));
    };
    load();
  }, []);

  const table = tables.find(t => t.id === tableId);
  const currentOrder = table?.currentOrderId
    ? orders.find(o => o.id === table.currentOrderId)
    : null;

  if (!table) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-xl font-semibold mb-2">Invalid Table</p>
          <p className="text-gray-600">This QR code is not valid</p>
        </div>
      </div>
    );
  }

  const categories = ['All', ...new Set(products.map(p => p.category))];
  const availableProducts = products.filter(
    p => p.isActive && p.kitchenStatus === 'available'
  );
  const filteredProducts = selectedCategory === 'All'
    ? availableProducts
    : availableProducts.filter(p => p.category === selectedCategory);

  const addToCart = (product: Product) => {
    setCart(current => {
      const existing = current.find(item => item.product.id === product.id);
      if (existing) {
        return current.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...current, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: string, change: number) => {
    setCart(current => {
      return current.map(item => {
        if (item.product.id === productId) {
          const newQuantity = item.quantity + change;
          return newQuantity > 0 ? { ...item, quantity: newQuantity } : item;
        }
        return item;
      }).filter(item => item.quantity > 0);
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(current => current.filter(item => item.product.id !== productId));
  };

  const handlePlaceOrder = async () => {
    if (cart.length === 0) return;

    // Create a "customer" user for ordering
    const customerUser = {
      id: 'customer',
      name: `Table ${table.number} (Customer)`,
      role: 'waiter' as const,
    };

    // If table has no order, we need to create one first
    let orderId = table.currentOrderId;

    if (!orderId) {
      const newOrder = OrderController.createOrder(tables, tableId!, customerUser as any);
      if (newOrder.success && newOrder.order) {
        orderId = newOrder.order.id;
        const newOrderWithItems = { ...newOrder.order, items: [] };
        setOrders((prev: any[]) => [...prev, newOrderWithItems]);
        await supabase.from('tables').update({ status: 'occupied', current_order_id: orderId }).eq('id', tableId);
        await supabase.from('orders').insert({
          id: newOrder.order.id, table_id: tableId, table_number: newOrder.order.tableNumber,
          subtotal: 0, tax: 0, discount: 0, total: 0, status: 'open', branch_id: 'branch-1',
        });
        setTables((prev: any[]) => prev.map(t => t.id === tableId ? { ...t, status: 'occupied', currentOrderId: orderId } : t));
      }
    }

    if (orderId) {
      for (const cartItem of cart) {
        const itemId = `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const subtotal = cartItem.product.price * cartItem.quantity;
        await supabase.from('order_items').insert({
          id: itemId, order_id: orderId, product_id: cartItem.product.id,
          product_name: cartItem.product.name, quantity: cartItem.quantity,
          price: cartItem.product.price, subtotal, added_by: 'customer',
          added_by_name: `Table ${tables.find(t => t.id === tableId)?.number ?? ''} (Customer)`,
          status: 'pending',
        });
      }
      setCart([]);
      setShowCart(false);
      alert('Order placed successfully!');
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const orderSubtotal = currentOrder?.subtotal || 0;
  const orderTax = currentOrder?.tax || 0;
  const orderTotal = currentOrder?.total || 0;

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-xl">Table {table.number}</h1>
          <p className="text-sm text-gray-600">Scan & Order</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowBill(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            <Receipt className="size-4" />
            View Bill
          </button>
          <button
            onClick={() => setShowCart(true)}
            className="relative flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <ShoppingCart className="size-4" />
            Cart
            {cartItemCount > 0 && (
              <span className="absolute -top-2 -right-2 size-6 flex items-center justify-center bg-red-500 text-white text-xs rounded-full">
                {cartItemCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Categories */}
      <div className="bg-white border-b px-6 py-3 overflow-x-auto">
        <div className="flex gap-2">
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
                selectedCategory === category
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Menu Items */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredProducts.map(product => (
            <div
              key={product.id}
              className="bg-white rounded-lg overflow-hidden border hover:shadow-lg transition-shadow"
            >
              <img
                src={product.image}
                alt={product.name}
                className="w-full aspect-square object-cover"
              />
              <div className="p-4">
                <h3 className="font-medium mb-1">{product.name}</h3>
                <p className="text-sm text-gray-600 mb-3">${product.price.toFixed(2)}</p>
                <button
                  onClick={() => addToCart(product)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Plus className="size-4" />
                  Add to Cart
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cart Modal */}
      {showCart && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50">
          <div className="bg-white w-full md:max-w-md md:rounded-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-semibold text-lg">Your Order</h2>
              <button
                onClick={() => setShowCart(false)}
                className="size-8 flex items-center justify-center hover:bg-gray-100 rounded"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.length === 0 ? (
                <p className="text-center text-gray-400 py-8">Cart is empty</p>
              ) : (
                cart.map(item => (
                  <div key={item.product.id} className="flex gap-3 p-3 bg-gray-50 rounded-lg">
                    <img
                      src={item.product.image}
                      alt={item.product.name}
                      className="size-16 object-cover rounded"
                    />
                    <div className="flex-1">
                      <h4 className="font-medium">{item.product.name}</h4>
                      <p className="text-sm text-gray-600">${item.product.price.toFixed(2)}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => updateQuantity(item.product.id, -1)}
                          className="size-6 flex items-center justify-center bg-white rounded border"
                        >
                          <Minus className="size-3" />
                        </button>
                        <span className="w-8 text-center">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.product.id, 1)}
                          className="size-6 flex items-center justify-center bg-white rounded border"
                        >
                          <Plus className="size-3" />
                        </button>
                        <button
                          onClick={() => removeFromCart(item.product.id)}
                          className="ml-auto text-red-600 text-sm"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <div className="font-semibold">
                      ${(item.product.price * item.quantity).toFixed(2)}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t p-4 space-y-3">
              <div className="flex justify-between text-lg font-semibold">
                <span>Total</span>
                <span>${cartTotal.toFixed(2)}</span>
              </div>
              <button
                onClick={handlePlaceOrder}
                disabled={cart.length === 0}
                className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Place Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bill Modal */}
      {showBill && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50">
          <div className="bg-white w-full md:max-w-md md:rounded-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-semibold text-lg">Current Bill</h2>
              <button
                onClick={() => setShowBill(false)}
                className="size-8 flex items-center justify-center hover:bg-gray-100 rounded"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {!currentOrder || currentOrder.items.length === 0 ? (
                <p className="text-center text-gray-400 py-8">No orders yet</p>
              ) : (
                <div className="space-y-3">
                  {currentOrder.items.map(item => (
                    <div key={item.id} className="flex justify-between text-sm py-2 border-b">
                      <span>
                        {item.quantity}x {item.productName}
                      </span>
                      <span className="font-medium">${item.subtotal.toFixed(2)}</span>
                    </div>
                  ))}

                  <div className="space-y-2 pt-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Subtotal</span>
                      <span>${orderSubtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Tax</span>
                      <span>${orderTax.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-lg font-semibold pt-2 border-t">
                      <span>Total</span>
                      <span>${orderTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t p-4">
              <p className="text-sm text-gray-600 text-center">
                Please ask your waiter for payment
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
