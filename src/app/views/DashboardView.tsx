import { usePOS } from '../context/POSContext';
import { Link } from 'react-router';
import {
  ShoppingCart, Package, DollarSign, Users, TrendingUp, AlertTriangle,
  ArrowRight, Clock, CheckCircle, XCircle, Activity, BarChart3, PieChart,
  ShoppingCart as CartIcon, DollarSign as MoneyIcon, TrendingUp as GrowthIcon
} from 'lucide-react';
import { orderTotal, fmt, CURRENCY } from '../../lib/currency';
import { useMemo } from 'react';

function StatCard({ label, value, icon: Icon, color, sub, change }: {
  label: string; value: string | number; icon: any;
  color: string; sub?: string; change?: string;
}) {
  return (
    <div className={`${color} rounded-2xl p-5 border border-black/5 text-white shadow-lg`}>
      <div className="flex items-center justify-between mb-3">
        <div className="bg-white/20 p-2.5 rounded-xl">
          <Icon className="size-5" />
        </div>
        {change && (
          <span className="text-xs bg-white/20 px-2 py-1 rounded-lg">
            {change}
          </span>
        )}
      </div>
      <p className="text-sm text-white/80 mb-1">{label}</p>
      <p className="text-3xl font-bold">{value}</p>
      {sub && <p className="text-xs text-white/60 mt-1">{sub}</p>}
    </div>
  );
}

// Simple line chart component
function LineChart({ data, height = 200 }: { data: number[]; height?: number }) {
  const max = Math.max(...data, 1);
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1 || 1)) * 100;
    const y = 100 - (val / max) * 100;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="w-full" style={{ height }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
        <defs>
          <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon
          points={`0,100 ${points} 100,100`}
          fill="url(#lineGradient)"
        />
        <polyline
          points={points}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

// Simple bar chart component
function BarChart({ data, labels, height = 200 }: { data: number[]; labels: string[]; height?: number }) {
  const max = Math.max(...data, 1);
  
  return (
    <div className="w-full flex items-end gap-2" style={{ height }}>
      {data.map((val, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-2">
          <div className="text-xs text-gray-500 font-medium">
            {fmt(val)}
          </div>
          <div
            className="w-full bg-gradient-to-t from-blue-500 to-blue-400 rounded-t-lg transition-all hover:from-blue-600 hover:to-blue-500"
            style={{ height: `${(val / max) * (height - 40)}px` }}
          />
          <div className="text-xs text-gray-500 truncate w-full text-center">
            {labels[i]}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardView() {
  const { currentUser, orders, tables, products, users } = usePOS();
  if (!currentUser) return null;

  // Calculate stats
  const openOrders = orders.filter(o => o.status === 'open');
  const completedOrders = orders.filter(o => o.status === 'completed');
  const occupiedTables = tables.filter(t => t.status === 'occupied');
  const availableTables = tables.filter(t => t.status === 'available');
  const lowStockItems = products.filter(p => p.stock <= p.reorderPoint);
  const activeUsers = users.filter(u => u.status === 'active');
  
  // Today's stats
  const today = new Date().toDateString();
  const todayOrders = orders.filter(o => new Date(o.createdAt).toDateString() === today);
  const todayCompleted = todayOrders.filter(o => o.status === 'completed');
  const todayRevenue = todayCompleted.reduce((sum, o) => sum + orderTotal(o), 0);
  const todayTakeaway = todayOrders.filter(o => o.order_type === 'takeaway').length;
  const todayDineIn = todayOrders.filter(o => o.order_type === 'dine-in').length;

  // Revenue data for last 7 days
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    const dateStr = date.toDateString();
    const dayOrders = orders.filter(o => 
      new Date(o.createdAt).toDateString() === dateStr && o.status === 'completed'
    );
    return {
      label: date.toLocaleDateString('en', { weekday: 'short' }),
      value: dayOrders.reduce((sum, o) => sum + orderTotal(o), 0)
    };
  });

  // Category breakdown
  const categoryStats = useMemo(() => {
    const categoryMap = new Map<string, number>();
    completedOrders.forEach(order => {
      order.items?.forEach((item: any) => {
        const category = item.category || 'Other';
        categoryMap.set(category, (categoryMap.get(category) || 0) + item.quantity);
      });
    });
    return Array.from(categoryMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [completedOrders]);

  // Recent orders
  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-500 text-sm mt-1">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border shadow-sm">
            <Activity className="size-4 text-emerald-500" />
            <span className="text-sm font-medium text-gray-700">Live Monitoring</span>
          </div>
        </div>

        {/* Stat Cards Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Today's Revenue"
            value={fmt(todayRevenue)}
            icon={MoneyIcon}
            color="bg-gradient-to-br from-emerald-500 to-emerald-600"
            sub={`${todayCompleted.length} orders completed`}
            change="+12%"
          />
          <StatCard
            label="Total Orders Today"
            value={todayOrders.length}
            icon={CartIcon}
            color="bg-gradient-to-br from-blue-500 to-blue-600"
            sub={`${todayDineIn} dine-in • ${todayTakeaway} takeaway`}
          />
          <StatCard
            label="Tables Occupied"
            value={`${occupiedTables.length}/${tables.length}`}
            icon={ShoppingCart}
            color="bg-gradient-to-br from-purple-500 to-purple-600"
            sub={`${availableTables.length} available`}
          />
          <StatCard
            label="Low Stock Items"
            value={lowStockItems.length}
            icon={AlertTriangle}
            color="bg-gradient-to-br from-orange-500 to-orange-600"
            sub={lowStockItems.length > 0 ? 'Needs attention' : 'All stocked'}
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue Chart */}
          <div className="bg-white rounded-2xl p-6 border shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Revenue Trend</h3>
                <p className="text-sm text-gray-500">Last 7 days</p>
              </div>
              <BarChart3 className="size-5 text-gray-400" />
            </div>
            <LineChart data={last7Days.map(d => d.value)} height={200} />
            <div className="flex justify-between mt-2 text-xs text-gray-500">
              {last7Days.map((d, i) => (
                <span key={i}>{d.label}</span>
              ))}
            </div>
          </div>

          {/* Orders by Category */}
          <div className="bg-white rounded-2xl p-6 border shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Top Categories</h3>
                <p className="text-sm text-gray-500">Items sold</p>
              </div>
              <PieChart className="size-5 text-gray-400" />
            </div>
            {categoryStats.length > 0 ? (
              <BarChart
                data={categoryStats.map(c => c[1])}
                labels={categoryStats.map(c => c[0])}
                height={200}
              />
            ) : (
              <div className="text-center py-12 text-gray-400">
                <Package className="size-12 mx-auto mb-2 opacity-30" />
                <p>No sales data yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Orders */}
          <div className="lg:col-span-2 bg-white rounded-2xl p-6 border shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Recent Orders</h3>
                <p className="text-sm text-gray-500">Latest transactions</p>
              </div>
              <Link to="/tables" className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                View All <ArrowRight className="size-4" />
              </Link>
            </div>
            <div className="space-y-3">
              {recentOrders.length > 0 ? recentOrders.map(order => (
                <div key={order.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`size-10 rounded-xl flex items-center justify-center ${
                      order.order_type === 'takeaway' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'
                    }`}>
                      {order.order_type === 'takeaway' ? '🛍️' : order.tableNumber}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {order.order_type === 'takeaway' ? 'Takeaway' : `Table ${order.tableNumber}`}
                        {order.billNumber ? ` #${order.billNumber}` : ''}
                      </p>
                      <p className="text-xs text-gray-500">
                        {order.items?.length || 0} items • {new Date(order.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-lg text-xs font-medium ${
                      order.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                      order.status === 'open' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {order.status}
                    </span>
                    <span className="font-bold text-gray-900">{fmt(orderTotal(order))}</span>
                  </div>
                </div>
              )) : (
                <div className="text-center py-12 text-gray-400">
                  <Clock className="size-12 mx-auto mb-2 opacity-30" />
                  <p>No orders yet</p>
                </div>
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="space-y-6">
            {/* Active Users */}
            <div className="bg-white rounded-2xl p-6 border shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-blue-100 p-2 rounded-xl">
                  <Users className="size-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Active Staff</h3>
                  <p className="text-xs text-gray-500">{activeUsers.length} employees</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-blue-600">
                    {users.filter(u => u.role === 'waiter').length}
                  </p>
                  <p className="text-xs text-gray-500">Waiters</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600">
                    {users.filter(u => u.role === 'cashier').length}
                  </p>
                  <p className="text-xs text-gray-500">Cashiers</p>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 text-white shadow-lg">
              <h3 className="font-bold text-lg mb-4">Quick Actions</h3>
              <div className="space-y-2">
                <Link to="/tables" className="flex items-center justify-between bg-white/10 p-3 rounded-xl hover:bg-white/20 transition-colors">
                  <span className="text-sm font-medium">View Tables</span>
                  <ArrowRight className="size-4" />
                </Link>
                <Link to="/inventory" className="flex items-center justify-between bg-white/10 p-3 rounded-xl hover:bg-white/20 transition-colors">
                  <span className="text-sm font-medium">Inventory</span>
                  <ArrowRight className="size-4" />
                </Link>
                <Link to="/reports" className="flex items-center justify-between bg-white/10 p-3 rounded-xl hover:bg-white/20 transition-colors">
                  <span className="text-sm font-medium">Reports</span>
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
