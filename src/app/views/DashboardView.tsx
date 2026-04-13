import { usePOS } from '../context/POSContext';
import { Link } from 'react-router';
import { ShoppingCart, Package, DollarSign, Users, TrendingUp, AlertTriangle, ArrowRight, Clock } from 'lucide-react';

function StatCard({ label, value, icon: Icon, color, sub }: {
  label: string; value: string | number; icon: any;
  color: 'blue' | 'green' | 'amber' | 'red' | 'purple'; sub?: string;
}) {
  const colors = {
    blue:   { bg: 'bg-blue-50',   icon: 'bg-blue-100 text-blue-600',   val: 'text-blue-700' },
    green:  { bg: 'bg-green-50',  icon: 'bg-green-100 text-green-600',  val: 'text-green-700' },
    amber:  { bg: 'bg-amber-50',  icon: 'bg-amber-100 text-amber-600',  val: 'text-amber-700' },
    red:    { bg: 'bg-red-50',    icon: 'bg-red-100 text-red-600',      val: 'text-red-700' },
    purple: { bg: 'bg-purple-50', icon: 'bg-purple-100 text-purple-600',val: 'text-purple-700' },
  };
  const c = colors[color];
  return (
    <div className={`${c.bg} rounded-2xl p-5 border border-black/5`}>
      <div className={`inline-flex size-10 items-center justify-center rounded-xl ${c.icon} mb-3`}>
        <Icon className="size-5" />
      </div>
      <p className="text-sm text-gray-500 mb-0.5">{label}</p>
      <p className={`text-3xl font-bold ${c.val}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export function DashboardView() {
  const { currentUser, orders, tables, products, users } = usePOS();
  if (!currentUser) return null;

  const openOrders = orders.filter(o => o.status === 'open');
  const occupiedTables = tables.filter(t => t.status === 'occupied');
  const lowStockItems = products.filter(p => p.stock <= p.reorderPoint);
  const activeUsers = users.filter(u => u.status === 'active');
  const todayRevenue = orders
    .filter(o => new Date(o.createdAt).toDateString() === new Date().toDateString() && o.status === 'completed')
    .reduce((sum, o) => sum + o.total, 0);

  const roleCards: Record<string, JSX.Element> = {
    cashier: (
      <div className="bg-blue-600 text-white rounded-2xl p-6 flex items-center justify-between">
        <div>
          <p className="font-semibold text-lg mb-1">Your Assigned Tables</p>
          <p className="text-blue-100 text-sm mb-4">{tables.filter(t => t.assignedCashierId === currentUser.id).length} tables waiting for payment</p>
          <Link to="/tables" className="inline-flex items-center gap-2 bg-white text-blue-600 font-medium text-sm px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors">
            View Tables <ArrowRight className="size-4" />
          </Link>
        </div>
        <ShoppingCart className="size-16 text-blue-400 opacity-50" />
      </div>
    ),
    waiter: (
      <div className="bg-emerald-600 text-white rounded-2xl p-6 flex items-center justify-between">
        <div>
          <p className="font-semibold text-lg mb-1">Active Tables</p>
          <p className="text-emerald-100 text-sm mb-4">{occupiedTables.length} tables occupied</p>
          <Link to="/tables" className="inline-flex items-center gap-2 bg-white text-emerald-600 font-medium text-sm px-4 py-2 rounded-lg hover:bg-emerald-50 transition-colors">
            Manage Orders <ArrowRight className="size-4" />
          </Link>
        </div>
        <ShoppingCart className="size-16 text-emerald-400 opacity-50" />
      </div>
    ),
    kitchen: (
      <div className="bg-orange-500 text-white rounded-2xl p-6 flex items-center justify-between">
        <div>
          <p className="font-semibold text-lg mb-1">Kitchen Dashboard</p>
          <p className="text-orange-100 text-sm mb-4">Mark items as finished or out of stock</p>
          <Link to="/kitchen" className="inline-flex items-center gap-2 bg-white text-orange-600 font-medium text-sm px-4 py-2 rounded-lg hover:bg-orange-50 transition-colors">
            Open Kitchen <ArrowRight className="size-4" />
          </Link>
        </div>
        <Package className="size-16 text-orange-300 opacity-50" />
      </div>
    ),
    hr: (
      <div className="bg-purple-600 text-white rounded-2xl p-6 flex items-center justify-between">
        <div>
          <p className="font-semibold text-lg mb-1">HR Dashboard</p>
          <p className="text-purple-100 text-sm mb-4">{activeUsers.length} active employees</p>
          <Link to="/attendance" className="inline-flex items-center gap-2 bg-white text-purple-600 font-medium text-sm px-4 py-2 rounded-lg hover:bg-purple-50 transition-colors">
            View Attendance <ArrowRight className="size-4" />
          </Link>
        </div>
        <Users className="size-16 text-purple-300 opacity-50" />
      </div>
    ),
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-6 space-y-6 max-w-6xl">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Stats grid */}
        {(currentUser.role === 'admin' || currentUser.role === 'cashier') && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Open Orders" value={openOrders.length} icon={ShoppingCart} color="blue" />
            <StatCard label="Tables Occupied" value={`${occupiedTables.length}/${tables.length}`} icon={TrendingUp} color="green" />
            <StatCard label="Today's Revenue" value={`SAR ${todayRevenue.toFixed(0)}`} icon={DollarSign} color="amber" />
            <StatCard label="Low Stock" value={lowStockItems.length} icon={AlertTriangle} color={lowStockItems.length > 0 ? 'red' : 'green'} sub={lowStockItems.length > 0 ? 'items need restocking' : 'all good'} />
          </div>
        )}

        {/* Role-specific CTA */}
        {roleCards[currentUser.role]}

        {/* Admin panels */}
        {currentUser.role === 'admin' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent orders */}
            <div className="bg-white rounded-2xl border border-gray-100">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Live Orders</h3>
                <Link to="/tables" className="text-xs text-blue-600 hover:underline">View all</Link>
              </div>
              <div className="divide-y divide-gray-50">
                {openOrders.slice(0, 6).map(order => (
                  <div key={order.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="size-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center font-semibold text-sm">
                        {order.tableNumber}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">Table {order.tableNumber}</p>
                        <p className="text-xs text-gray-400">{order.items.length} items</p>
                      </div>
                    </div>
                    <p className="font-semibold text-gray-900 text-sm">SAR {order.total.toFixed(2)}</p>
                  </div>
                ))}
                {openOrders.length === 0 && (
                  <div className="px-5 py-10 text-center text-gray-400 text-sm">No open orders right now</div>
                )}
              </div>
            </div>

            {/* Low stock */}
            <div className="bg-white rounded-2xl border border-gray-100">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Stock Alerts</h3>
                <Link to="/inventory" className="text-xs text-blue-600 hover:underline">View inventory</Link>
              </div>
              <div className="divide-y divide-gray-50">
                {lowStockItems.slice(0, 6).map(p => (
                  <div key={p.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.category}</p>
                    </div>
                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-red-50 text-red-600">
                      {p.stock} left
                    </span>
                  </div>
                ))}
                {lowStockItems.length === 0 && (
                  <div className="px-5 py-10 text-center text-gray-400 text-sm">All items well stocked ✓</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
