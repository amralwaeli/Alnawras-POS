import { usePOS } from '../context/POSContext';
import { DollarSign, ShoppingCart, Package, TrendingUp } from 'lucide-react';

export function ReportsView() {
  const { orders, currentUser } = usePOS();

  if (!currentUser) return null;

  const completedOrders = orders.filter(o => o.status === 'completed');
  const totalRevenue = completedOrders.reduce((sum, o) => sum + o.total, 0);
  const totalTax = completedOrders.reduce((sum, o) => sum + o.tax, 0);
  const totalItems = completedOrders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0);

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="font-semibold text-2xl">Sales Reports</h1>
          <p className="text-gray-600">Analytics and performance metrics</p>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="size-10 flex items-center justify-center bg-green-100 rounded-lg">
                <DollarSign className="size-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Revenue</p>
                <p className="text-2xl font-semibold">${totalRevenue.toFixed(2)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="size-10 flex items-center justify-center bg-blue-100 rounded-lg">
                <ShoppingCart className="size-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Orders</p>
                <p className="text-2xl font-semibold">{orders.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="size-10 flex items-center justify-center bg-purple-100 rounded-lg">
                <TrendingUp className="size-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Tax</p>
                <p className="text-2xl font-semibold">${totalTax.toFixed(2)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="size-10 flex items-center justify-center bg-orange-100 rounded-lg">
                <Package className="size-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Items Sold</p>
                <p className="text-2xl font-semibold">{totalItems}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b">
            <h2 className="font-semibold">Recent Orders</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Order ID</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Table</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Items</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Total</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {orders.map(order => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-sm">{order.id}</td>
                    <td className="px-4 py-3">Table {order.tableNumber}</td>
                    <td className="px-4 py-3 text-right">{order.items.length}</td>
                    <td className="px-4 py-3 text-right font-medium">${order.total.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            order.status === 'completed'
                              ? 'bg-green-100 text-green-700'
                              : order.status === 'open'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {order.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
