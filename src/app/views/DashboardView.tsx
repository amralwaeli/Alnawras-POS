import { usePOS } from '../context/POSContext';
import { Link } from 'react-router';
import { ShoppingCart, Package, DollarSign, Users, Clock, TrendingUp } from 'lucide-react';

export function DashboardView() {
  const { currentUser, orders, tables, products, users } = usePOS();

  if (!currentUser) {
    return null;
  }

  const openOrders = orders.filter(o => o.status === 'open');
  const occupiedTables = tables.filter(t => t.status === 'occupied');
  const lowStockItems = products.filter(p => p.stock <= p.reorderPoint);
  const activeUsers = users.filter(u => u.status === 'active');

  const todayRevenue = orders
    .filter(o => {
      const orderDate = new Date(o.createdAt).toDateString();
      const today = new Date().toDateString();
      return orderDate === today && o.status === 'completed';
    })
    .reduce((sum, o) => sum + o.total, 0);

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="font-semibold text-2xl">Dashboard</h1>
          <p className="text-gray-600">Welcome back, {currentUser.name}</p>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-lg border">
            <div className="flex items-center gap-3 mb-2">
              <div className="size-10 flex items-center justify-center bg-blue-100 rounded-lg">
                <ShoppingCart className="size-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Open Orders</p>
                <p className="text-2xl font-semibold">{openOrders.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border">
            <div className="flex items-center gap-3 mb-2">
              <div className="size-10 flex items-center justify-center bg-green-100 rounded-lg">
                <TrendingUp className="size-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Occupied Tables</p>
                <p className="text-2xl font-semibold">{occupiedTables.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border">
            <div className="flex items-center gap-3 mb-2">
              <div className="size-10 flex items-center justify-center bg-purple-100 rounded-lg">
                <DollarSign className="size-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Today's Revenue</p>
                <p className="text-2xl font-semibold">${todayRevenue.toFixed(2)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border">
            <div className="flex items-center gap-3 mb-2">
              <div className="size-10 flex items-center justify-center bg-orange-100 rounded-lg">
                <Package className="size-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Low Stock Items</p>
                <p className="text-2xl font-semibold">{lowStockItems.length}</p>
              </div>
            </div>
          </div>
        </div>

        {currentUser.role === 'admin' && (
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white rounded-lg border">
              <div className="p-4 border-b">
                <h3 className="font-semibold">Recent Orders</h3>
              </div>
              <div className="p-4 space-y-3">
                {openOrders.slice(0, 5).map(order => (
                  <div key={order.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Table {order.tableNumber}</p>
                      <p className="text-sm text-gray-600">{order.items.length} items</p>
                    </div>
                    <p className="font-semibold">${order.total.toFixed(2)}</p>
                  </div>
                ))}
                {openOrders.length === 0 && (
                  <p className="text-center text-gray-400 py-4">No open orders</p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg border">
              <div className="p-4 border-b">
                <h3 className="font-semibold">Low Stock Alert</h3>
              </div>
              <div className="p-4 space-y-3">
                {lowStockItems.slice(0, 5).map(product => (
                  <div key={product.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{product.name}</p>
                      <p className="text-sm text-gray-600">{product.category}</p>
                    </div>
                    <span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded">
                      {product.stock} left
                    </span>
                  </div>
                ))}
                {lowStockItems.length === 0 && (
                  <p className="text-center text-gray-400 py-4">All items well stocked</p>
                )}
              </div>
            </div>
          </div>
        )}

        {currentUser.role === 'cashier' && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="font-semibold text-lg mb-2">Your Assigned Tables</h3>
            <p className="text-gray-600 mb-4">
              You have {tables.filter(t => t.assignedCashierId === currentUser.id).length} tables assigned
            </p>
            <Link
              to="/tables"
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              View Tables
            </Link>
          </div>
        )}

        {currentUser.role === 'waiter' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <h3 className="font-semibold text-lg mb-2">Active Tables</h3>
            <p className="text-gray-600 mb-4">
              {occupiedTables.length} tables currently occupied
            </p>
            <Link
              to="/tables"
              className="inline-block px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Manage Orders
            </Link>
          </div>
        )}

        {currentUser.role === 'kitchen' && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
            <h3 className="font-semibold text-lg mb-2">Kitchen Dashboard</h3>
            <p className="text-gray-600 mb-4">
              Manage inventory and mark items as finished/out-of-stock
            </p>
            <Link
              to="/kitchen"
              className="inline-block px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
            >
              Go to Kitchen
            </Link>
          </div>
        )}

        {currentUser.role === 'hr' && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
            <h3 className="font-semibold text-lg mb-2">HR Dashboard</h3>
            <p className="text-gray-600 mb-4">
              {activeUsers.length} active employees
            </p>
            <Link
              to="/attendance"
              className="inline-block px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              View Attendance
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
