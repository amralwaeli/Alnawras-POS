import { usePOS } from '../../context/POSContext';
import { Link } from 'react-router';
import {
  ShoppingCart, Users, AlertTriangle, ArrowRight, Activity,
  TrendingUp, Package, Clock, ShoppingBag, Utensils,
  CreditCard, BarChart2, RefreshCw
} from 'lucide-react';
import { orderTotal, fmt } from '../../../lib/currency';
import { useMemo, useState, useEffect } from 'react';

// ─── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ data, color = '#10b981' }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 100, h = 32;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');
  const area = `0,${h} ${pts} ${w},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#sg-${color.replace('#','')})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Mini Bar Chart ───────────────────────────────────────────────────────────
function MiniBar({ data, labels }: { data: number[]; labels: string[] }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-1.5 h-24">
      {data.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full rounded-t-md transition-all duration-500"
            style={{
              height: `${Math.max(4, (v / max) * 80)}px`,
              background: i === data.length - 1
                ? 'linear-gradient(180deg,#10b981,#059669)'
                : 'linear-gradient(180deg,#e2e8f0,#cbd5e1)',
            }}
          />
          <span className="text-[9px] text-gray-400 font-medium">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, icon: Icon, accent, trend, sparkData,
}: {
  label: string; value: string | number; sub?: string;
  icon: any; accent: string; trend?: string; sparkData?: number[];
}) {
  return (
    <div className="relative bg-white rounded-2xl border border-gray-100 p-5 shadow-sm overflow-hidden group hover:shadow-md transition-shadow">
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ background: `radial-gradient(circle at 80% 20%, ${accent}10, transparent 60%)` }}
      />
      <div className="flex items-start justify-between mb-3">
        <div className="p-2.5 rounded-xl" style={{ background: `${accent}15` }}>
          <Icon className="size-4.5" style={{ color: accent }} />
        </div>
        {trend && (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: `${accent}15`, color: accent }}>
            {trend}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900 mt-1 tracking-tight">{value}</p>
      <p className="text-xs text-gray-500 font-medium mt-0.5">{label}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-1">{sub}</p>}
      {sparkData && (
        <div className="mt-3 -mx-1">
          <Sparkline data={sparkData} color={accent} />
        </div>
      )}
    </div>
  );
}

// ─── Revenue Chart ────────────────────────────────────────────────────────────
function RevenueChart({ days }: { days: { label: string; value: number }[] }) {
  const max = Math.max(...days.map(d => d.value), 1);
  const h = 120;
  const w = 300;
  const pts = days.map((d, i) => {
    const x = (i / (days.length - 1)) * w;
    const y = h - (d.value / max) * h;
    return { x, y, ...d };
  });
  const polyPts = pts.map(p => `${p.x},${p.y}`).join(' ');
  const areaPts = `0,${h} ${polyPts} ${w},${h}`;
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h + 4}`} className="w-full" style={{ height: 140 }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={areaPts} fill="url(#revGrad)" />
        <polyline points={polyPts} fill="none" stroke="#10b981" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={p.x} cy={p.y} r={hovered === i ? 4 : 2.5}
            fill={hovered === i ? '#10b981' : '#fff'}
            stroke="#10b981" strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            className="cursor-pointer transition-all"
          />
        ))}
      </svg>
      {hovered !== null && (
        <div
          className="absolute bg-gray-900 text-white text-xs px-2 py-1 rounded-lg pointer-events-none shadow-lg"
          style={{ top: 0, left: `${(hovered / (pts.length - 1)) * 100}%`, transform: 'translateX(-50%)' }}
        >
          {fmt(pts[hovered].value)}
        </div>
      )}
      <div className="flex justify-between mt-1">
        {days.map((d, i) => (
          <span key={i} className={`text-[10px] font-medium ${hovered === i ? 'text-emerald-600' : 'text-gray-400'}`}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Order Row ────────────────────────────────────────────────────────────────
function OrderRow({ order }: { order: any }) {
  const isTakeaway = order.order_type === 'takeaway' || order.orderType === 'takeaway';
  const statusStyle: Record<string, string> = {
    completed: 'bg-emerald-50 text-emerald-700',
    open: 'bg-blue-50 text-blue-700',
  };
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50/60 -mx-2 px-2 rounded-lg transition-colors group">
      <div className={`size-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${
        isTakeaway ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'
      }`}>
        {isTakeaway ? <ShoppingBag className="size-4" /> : <Utensils className="size-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">
          {isTakeaway
            ? `Takeaway ${order.billNumber ? `#${order.billNumber}` : ''}`
            : `Table ${order.tableNumber}${order.billNumber ? ` · #${order.billNumber}` : ''}`}
        </p>
        <p className="text-[11px] text-gray-400">
          {order.items?.length || 0} items · {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusStyle[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {order.status}
        </span>
        <span className="text-sm font-bold text-gray-900 w-20 text-right">{fmt(orderTotal(order))}</span>
      </div>
    </div>
  );
}

// ─── Live Clock ───────────────────────────────────────────────────────────────
function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="text-sm font-mono text-gray-500">
      {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export function AdminDashboardView() {
  const { currentUser, orders, tables, products, users } = usePOS();
  if (!currentUser) return null;

  const today = new Date().toDateString();
  const todayOrders = orders.filter(o => new Date(o.createdAt).toDateString() === today);
  const todayCompleted = todayOrders.filter(o => o.status === 'completed');
  const todayRevenue = todayCompleted.reduce((s, o) => s + orderTotal(o), 0);
  const todayTakeaway = todayOrders.filter(o => (o.order_type ?? o.orderType) === 'takeaway').length;
  const todayDineIn = todayOrders.filter(o => (o.order_type ?? o.orderType) === 'dine-in').length;
  const openOrders = orders.filter(o => o.status === 'open');
  const occupiedTables = tables.filter(t => t.status === 'occupied');
  const lowStock = products.filter(p => p.stock <= p.reorderPoint);

  const last7Days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const ds = d.toDateString();
    const rev = orders
      .filter(o => new Date(o.createdAt).toDateString() === ds && o.status === 'completed')
      .reduce((s, o) => s + orderTotal(o), 0);
    return { label: d.toLocaleDateString('en', { weekday: 'short' }), value: rev };
  }), [orders]);

  const revenueSpark = last7Days.map(d => d.value);

  const topItems = useMemo(() => {
    const map = new Map<string, number>();
    orders.filter(o => o.status === 'completed').forEach(o => {
      o.items?.forEach((item: any) => {
        const n = item.productName || item.product_name || 'Item';
        map.set(n, (map.get(n) || 0) + (item.quantity || 1));
      });
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [orders]);

  const recentOrders = useMemo(() =>
    [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8),
    [orders]
  );

  const paymentBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    orders.filter(o => o.status === 'completed' && o.paymentMethod).forEach(o => {
      const method = (o.paymentMethod as string).split(' ')[0].toLowerCase();
      map.set(method, (map.get(method) || 0) + orderTotal(o));
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [orders]);

  const totalRevenue = orders.filter(o => o.status === 'completed').reduce((s, o) => s + orderTotal(o), 0);

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#f8fafc' }}>
      <div className="max-w-7xl mx-auto p-6 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <LiveClock />
            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-xl">
              <Activity className="size-3.5 text-emerald-500 animate-pulse" />
              <span className="text-xs font-semibold text-emerald-700">Live</span>
            </div>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Today's Revenue"
            value={fmt(todayRevenue)}
            sub={`${todayCompleted.length} paid orders`}
            icon={TrendingUp}
            accent="#10b981"
            trend={revenueSpark[revenueSpark.length-1] >= revenueSpark[revenueSpark.length-2] ? '↑' : '↓'}
            sparkData={revenueSpark}
          />
          <KpiCard
            label="Orders Today"
            value={todayOrders.length}
            sub={`${todayDineIn} dine-in · ${todayTakeaway} takeaway`}
            icon={ShoppingCart}
            accent="#3b82f6"
          />
          <KpiCard
            label="Tables Occupied"
            value={`${occupiedTables.length} / ${tables.length}`}
            sub={`${tables.filter(t => t.status === 'available').length} available`}
            icon={Utensils}
            accent="#8b5cf6"
          />
          <KpiCard
            label="Low Stock"
            value={lowStock.length}
            sub={lowStock.length > 0 ? lowStock.slice(0,2).map(p=>p.name).join(', ') : 'All items stocked'}
            icon={AlertTriangle}
            accent={lowStock.length > 0 ? '#f59e0b' : '#10b981'}
          />
        </div>

        {/* ── Middle Row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Revenue chart */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-900">Revenue — Last 7 Days</h3>
                <p className="text-xs text-gray-400 mt-0.5">Completed orders only</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">Total</p>
                <p className="text-lg font-bold text-gray-900">{fmt(totalRevenue)}</p>
              </div>
            </div>
            <RevenueChart days={last7Days} />
          </div>

          {/* Order type breakdown */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex flex-col gap-4">
            <div>
              <h3 className="font-bold text-gray-900">Today's Mix</h3>
              <p className="text-xs text-gray-400 mt-0.5">By order type</p>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Dine-in', count: todayDineIn, total: todayOrders.length, color: '#3b82f6', icon: Utensils },
                { label: 'Takeaway', count: todayTakeaway, total: todayOrders.length, color: '#8b5cf6', icon: ShoppingBag },
              ].map(({ label, count, total, color, icon: Icon }) => (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <Icon className="size-3.5" style={{ color }} />
                      <span className="text-sm font-medium text-gray-700">{label}</span>
                    </div>
                    <span className="text-sm font-bold text-gray-900">{count}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${total ? (count / total) * 100 : 0}%`, background: color }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t pt-3 mt-auto">
              <p className="text-xs text-gray-500 font-medium mb-2">Payment Methods</p>
              <div className="space-y-2">
                {paymentBreakdown.length === 0 ? (
                  <p className="text-xs text-gray-400">No completed payments yet</p>
                ) : paymentBreakdown.slice(0,3).map(([method, amount]) => (
                  <div key={method} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <CreditCard className="size-3 text-gray-400" />
                      <span className="text-xs text-gray-600 capitalize">{method}</span>
                    </div>
                    <span className="text-xs font-semibold text-gray-800">{fmt(amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom Row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Recent Orders */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-900">Recent Orders</h3>
                <p className="text-xs text-gray-400 mt-0.5">{openOrders.length} currently open</p>
              </div>
              <Link to="/tables" className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700">
                All tables <ArrowRight className="size-3.5" />
              </Link>
            </div>
            <div>
              {recentOrders.length === 0 ? (
                <div className="text-center py-10 text-gray-300">
                  <Clock className="size-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No orders yet</p>
                </div>
              ) : recentOrders.map(o => <OrderRow key={o.id} order={o} />)}
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-4">

            {/* Top items */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900">Top Items</h3>
                <BarChart2 className="size-4 text-gray-300" />
              </div>
              {topItems.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No sales data yet</p>
              ) : (
                <div className="space-y-2.5">
                  {topItems.map(([name, qty], i) => {
                    const max = topItems[0][1];
                    return (
                      <div key={name}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-medium text-gray-700 truncate max-w-[70%]">{name}</span>
                          <span className="text-xs font-bold text-gray-900">{qty}×</span>
                        </div>
                        <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(qty / max) * 100}%`,
                              background: ['#10b981','#3b82f6','#8b5cf6','#f59e0b','#ef4444'][i],
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Staff */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Users className="size-4 text-gray-400" />
                <h3 className="font-bold text-gray-900">Staff</h3>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { role: 'waiter', label: 'Waiters', color: 'text-blue-600' },
                  { role: 'cashier', label: 'Cashiers', color: 'text-emerald-600' },
                  { role: 'admin', label: 'Admins', color: 'text-purple-600' },
                ].map(({ role, label, color }) => (
                  <div key={role} className="bg-gray-50 rounded-xl py-3">
                    <p className={`text-xl font-bold ${color}`}>{users.filter(u => u.role === role).length}</p>
                    <p className="text-[10px] text-gray-500 font-medium mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick links */}
            <div className="bg-gray-900 rounded-2xl p-5 shadow-sm">
              <h3 className="font-bold text-white mb-3 text-sm">Quick Actions</h3>
              <div className="space-y-2">
                {[
                  { to: '/tables', label: 'Tables', icon: Utensils },
                  { to: '/inventory', label: 'Inventory', icon: Package },
                  { to: '/reports', label: 'Reports', icon: BarChart2 },
                ].map(({ to, label, icon: Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    className="flex items-center justify-between bg-white/8 hover:bg-white/15 px-3 py-2.5 rounded-xl transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="size-3.5 text-gray-400 group-hover:text-white transition-colors" />
                      <span className="text-xs font-semibold text-gray-300 group-hover:text-white transition-colors">{label}</span>
                    </div>
                    <ArrowRight className="size-3.5 text-gray-600 group-hover:text-white transition-colors" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
