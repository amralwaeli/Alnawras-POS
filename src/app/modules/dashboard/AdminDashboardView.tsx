import { usePOS } from '../../context/POSContext';
import { Link } from 'react-router';
import {
  ShoppingCart, AlertTriangle, ArrowRight, Activity,
  TrendingUp, Package, Clock, ShoppingBag, Utensils,
  CreditCard, BarChart2, X, QrCode, UserCheck, Trophy, Star,
  Users, Building2, Bell, Download,
} from 'lucide-react';
import { orderTotal, fmt } from '../../../lib/currency';
import { useMemo, useState, useEffect } from 'react';
import { WorkforceController } from '../../controllers/WorkforceController';

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

// ─── Stat Card ────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, icon: Icon, accent, trend, sparkData,
}: {
  label: string; value: string | number; sub?: string;
  icon: any; accent: string; trend?: string; sparkData?: number[];
}) {
  return (
    <div className="relative bg-white rounded-2xl border border-gray-100 p-5 shadow-sm overflow-hidden group hover:shadow-md transition-shadow">
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ background: `radial-gradient(circle at 80% 20%, ${accent}10, transparent 60%)` }} />
      <div className="flex items-start justify-between mb-3">
        <div className="p-2.5 rounded-xl" style={{ background: `${accent}15` }}>
          <Icon className="size-4" style={{ color: accent }} />
        </div>
        {trend && (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: `${accent}15`, color: accent }}>{trend}</span>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900 mt-1 tracking-tight">{value}</p>
      <p className="text-xs text-gray-500 font-medium mt-0.5">{label}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-1">{sub}</p>}
      {sparkData && <div className="mt-3 -mx-1"><Sparkline data={sparkData} color={accent} /></div>}
    </div>
  );
}

// ─── Revenue Chart ────────────────────────────────────────────────────────────
function RevenueChart({ days }: { days: { label: string; value: number }[] }) {
  const max = Math.max(...days.map(d => d.value), 1);
  const h = 120, w = 300;
  const pts = days.map((d, i) => ({
    x: (i / (days.length - 1)) * w,
    y: h - (d.value / max) * h,
    ...d,
  }));
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
          <circle key={i} cx={p.x} cy={p.y} r={hovered === i ? 4 : 2.5}
            fill={hovered === i ? '#10b981' : '#fff'} stroke="#10b981" strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}
            className="cursor-pointer transition-all" />
        ))}
      </svg>
      {hovered !== null && (
        <div className="absolute bg-gray-900 text-white text-xs px-2 py-1 rounded-lg pointer-events-none shadow-lg"
          style={{ top: 0, left: `${(hovered / (pts.length - 1)) * 100}%`, transform: 'translateX(-50%)' }}>
          {fmt(pts[hovered].value)}
        </div>
      )}
      <div className="flex justify-between mt-1">
        {days.map((d, i) => (
          <span key={i} className={`text-[10px] font-medium ${hovered === i ? 'text-emerald-600' : 'text-gray-400'}`}>{d.label}</span>
        ))}
      </div>
    </div>
  );
}

// ─── Order Detail Modal ───────────────────────────────────────────────────────
function OrderDetailModal({ order, onClose }: { order: any; onClose: () => void }) {
  const isTakeaway = order.order_type === 'takeaway' || order.orderType === 'takeaway';
  const items: any[] = order.items ?? order.order_items ?? [];

  const byWaiter = useMemo(() => {
    const map = new Map<string, { name: string; isQr: boolean; items: any[] }>();
    items.forEach(item => {
      const isQr = !item.addedBy || item.addedBy === 'guest';
      const key = isQr ? '__qr__' : (item.addedBy || '__qr__');
      const name = isQr ? 'Customer (QR Code)' : (item.addedByName || item.added_by_name || 'Unknown Waiter');
      if (!map.has(key)) map.set(key, { name, isQr, items: [] });
      map.get(key)!.items.push(item);
    });
    return [...map.values()];
  }, [items]);

  const statusColors: Record<string, string> = {
    pending:   'bg-gray-100 text-gray-600',
    preparing: 'bg-amber-100 text-amber-700',
    ready:     'bg-emerald-100 text-emerald-700',
    served:    'bg-blue-100 text-blue-700',
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-3">
            <div className={`size-10 rounded-xl flex items-center justify-center ${isTakeaway ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>
              {isTakeaway ? <ShoppingBag className="size-5" /> : <Utensils className="size-5" />}
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-base">
                {isTakeaway
                  ? `Takeaway${order.billNumber ? ` #${order.billNumber}` : ''}`
                  : `Table ${order.tableNumber}${order.billNumber ? ` · #${order.billNumber}` : ''}`}
              </h2>
              <p className="text-xs text-gray-400">
                {new Date(order.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {' · '}{items.length} item{items.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${order.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
              {order.status}
            </span>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
              <X className="size-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {byWaiter.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No items recorded for this order.</p>
          ) : byWaiter.map((group, gi) => (
            <div key={gi}>
              <div className={`flex items-center gap-2 mb-2.5 px-3 py-2 rounded-xl ${group.isQr ? 'bg-violet-50' : 'bg-blue-50'}`}>
                {group.isQr
                  ? <QrCode className="size-3.5 text-violet-500 flex-shrink-0" />
                  : <UserCheck className="size-3.5 text-blue-500 flex-shrink-0" />}
                <span className={`text-xs font-bold uppercase tracking-widest ${group.isQr ? 'text-violet-700' : 'text-blue-700'}`}>
                  {group.name}
                </span>
                <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full ${group.isQr ? 'bg-violet-100 text-violet-600' : 'bg-blue-100 text-blue-600'}`}>
                  {group.items.length} item{group.items.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-2 pl-2">
                {group.items.map((item: any, ii: number) => {
                  const addedAt = item.addedAt instanceof Date
                    ? item.addedAt
                    : item.created_at ? new Date(item.created_at) : null;
                  return (
                    <div key={ii} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">
                          {item.productName || item.product_name || 'Item'}
                        </p>
                        {addedAt && (
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            Added {addedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                        {item.notes && <p className="text-[10px] text-amber-600 mt-0.5 italic">Note: {item.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColors[item.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {item.status ?? 'pending'}
                        </span>
                        <span className="text-xs text-gray-400">×{item.quantity ?? 1}</span>
                        <span className="text-sm font-bold text-gray-900 w-16 text-right">
                          {fmt((item.price ?? item.unit_price ?? 0) * (item.quantity ?? 1))}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t p-5 flex items-center justify-between bg-gray-50 rounded-b-2xl">
          <span className="text-sm text-gray-500 font-medium">Total</span>
          <span className="text-xl font-bold text-gray-900">{fmt(orderTotal(order))}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Order Row (clickable) ────────────────────────────────────────────────────
function OrderRow({ order, onClick }: { order: any; onClick: () => void }) {
  const isTakeaway = order.order_type === 'takeaway' || order.orderType === 'takeaway';
  const statusStyle: Record<string, string> = {
    completed: 'bg-emerald-50 text-emerald-700',
    open:      'bg-blue-50 text-blue-700',
  };
  const items: any[] = order.items ?? order.order_items ?? [];
  const waiterNames = [...new Set(
    items.filter(i => i.addedBy && i.addedBy !== 'guest').map(i => i.addedByName || i.added_by_name).filter(Boolean)
  )];
  const hasQrItems = items.some(i => !i.addedBy || i.addedBy === 'guest');

  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0 hover:bg-orange-50/50 -mx-2 px-2 rounded-lg transition-colors group text-left">
      <div className={`size-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${isTakeaway ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>
        {isTakeaway ? <ShoppingBag className="size-4" /> : <Utensils className="size-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">
          {isTakeaway
            ? `Takeaway ${order.billNumber ? `#${order.billNumber}` : ''}`
            : `Table ${order.tableNumber}${order.billNumber ? ` · #${order.billNumber}` : ''}`}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[11px] text-gray-400">
            {items.length} items · {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {waiterNames.slice(0, 2).map(name => (
            <span key={name} className="text-[10px] bg-blue-50 text-blue-600 font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              <UserCheck className="size-2.5" />{name}
            </span>
          ))}
          {hasQrItems && (
            <span className="text-[10px] bg-violet-50 text-violet-600 font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              <QrCode className="size-2.5" />QR
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusStyle[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {order.status}
        </span>
        <span className="text-sm font-bold text-gray-900 w-20 text-right">{fmt(orderTotal(order))}</span>
      </div>
    </button>
  );
}

// ─── Waiter Leaderboard ───────────────────────────────────────────────────────
function WaiterLeaderboard({ orders, users }: { orders: any[]; users: any[] }) {
  const waiters = users.filter(u => u.role === 'waiter');
  const performance = waiters.map(w => {
    const wOrders = orders.filter(o =>
      (o.items ?? o.order_items ?? []).some((i: any) => i.addedBy === w.id)
    );
    return {
      id: w.id,
      name: w.name,
      count: wOrders.length,
      total: wOrders.reduce((acc, o) => acc + orderTotal(o), 0),
    };
  }).sort((a, b) => b.total - a.total).slice(0, 5);

  if (performance.length === 0) return <p className="text-xs text-gray-400 py-4 text-center">No waiter activity yet today.</p>;

  const maxTotal = Math.max(...performance.map(p => p.total), 1);

  return (
    <div className="space-y-4">
      {performance.map((p, i) => (
        <div key={p.id} className="group">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <div className={`size-6 rounded-lg flex items-center justify-center text-[10px] font-bold ${i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                {i === 0 ? <Trophy className="size-3" /> : i + 1}
              </div>
              <span className="text-xs font-bold text-gray-700">{p.name}</span>
            </div>
            <span className="text-xs font-bold text-gray-900">{fmt(p.total)}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all duration-1000" style={{ width: `${(p.total / maxTotal) * 100}%` }} />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-gray-400">{p.count} orders</span>
            <span className="text-[10px] text-gray-400">{Math.round((p.total / maxTotal) * 100)}% of top</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AdminDashboardView() {
  const { orders, products, users, supabase } = usePOS();
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [isBackingUp, setIsBackingUp] = useState(false);

  // Filter for today's data
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayOrders = useMemo(() =>
    orders.filter(o => {
      const date = o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt);
      return date >= todayStart;
    }),
    [orders, todayStart]
  );

  const stats = useMemo(() => {
    const revenue = todayOrders.reduce((acc, o) => acc + orderTotal(o), 0);
    const count = todayOrders.length;
    const avg = count > 0 ? revenue / count : 0;
    const completed = todayOrders.filter(o => o.status === 'completed').length;

    // Peak Hours calculation
    const hourMap = new Array(24).fill(0);
    todayOrders.forEach(o => {
      const hour = (o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt)).getHours();
      hourMap[hour]++;
    });
    const peakHour = hourMap.indexOf(Math.max(...hourMap));

    return { revenue, count, avg, completed, peakHour, hourMap };
  }, [todayOrders]);

  // Low stock calculation
  useEffect(() => {
    const low = products.filter(p => p.stock <= (p.reorder_point || 5));
    setLowStock(low);
  }, [products]);

  // Backup function for Android
  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      const tables = ['users', 'products', 'orders', 'order_items', 'employees', 'attendance_logs', 'shifts'];
      const backupData: any = {};

      for (const table of tables) {
        const { data } = await supabase.from(table).select('*');
        backupData[table] = data;
      }

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `alnawras-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Backup failed:', err);
    } finally {
      setIsBackingUp(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Admin Dashboard</h1>
          <p className="text-gray-500 font-medium flex items-center gap-2 mt-1">
            <Building2 className="size-4" /> Alnawras Restaurant · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleBackup}
            disabled={isBackingUp}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-50 transition-all shadow-sm disabled:opacity-50"
          >
            <Download className={`size-4 ${isBackingUp ? 'animate-bounce' : ''}`} />
            {isBackingUp ? 'Backing up...' : 'Download Backup'}
          </button>
          <Link to="/inventory" className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-xl font-bold text-sm hover:bg-orange-600 transition-all shadow-lg shadow-orange-200">
            <Package className="size-4" /> Manage Inventory
          </Link>
        </div>
      </div>

      {/* Low Stock Alert */}
      {lowStock.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <div className="bg-red-100 p-2 rounded-xl">
              <AlertTriangle className="size-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-red-900">{lowStock.length} Items Running Low</p>
              <p className="text-xs text-red-600">Restock soon to avoid service interruptions.</p>
            </div>
          </div>
          <Link to="/inventory" className="text-xs font-bold text-red-700 hover:underline">View Items →</Link>
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <KpiCard
          label="Today's Revenue"
          value={fmt(stats.revenue)}
          sub={`${stats.completed} paid orders`}
          icon={TrendingUp}
          accent="#10b981"
          trend="+12%"
        />
        <KpiCard
          label="Total Orders"
          value={stats.count}
          sub="Dine-in & Takeaway"
          icon={ShoppingBag}
          accent="#3b82f6"
          trend="+5%"
        />
        <KpiCard
          label="Average Bill"
          value={fmt(stats.avg)}
          sub="Per customer"
          icon={CreditCard}
          accent="#f59e0b"
        />
        <KpiCard
          label="Peak Hour"
          value={`${stats.peakHour}:00`}
          sub="Busiest time today"
          icon={Clock}
          accent="#8b5cf6"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Recent Activity */}
        <div className="lg:col-span-2 space-y-8">
          {/* Revenue Chart */}
          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-bold text-gray-900">Revenue Flow</h3>
                <p className="text-xs text-gray-400">Hourly order volume today</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-500"></span>
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Live</span>
              </div>
            </div>
            <RevenueChart days={stats.hourMap.map((v, i) => ({ label: `${i}h`, value: v }))} />
          </div>

          {/* Recent Orders */}
          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-gray-900">Recent Orders</h3>
              <Link to="/reports" className="text-xs font-bold text-blue-600 hover:underline">View All</Link>
            </div>
            <div className="space-y-1">
              {todayOrders.length === 0 ? (
                <div className="py-12 text-center">
                  <Activity className="size-8 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm text-gray-400 font-medium">No orders yet today</p>
                </div>
              ) : (
                todayOrders.slice(0, 8).map(order => (
                  <OrderRow key={order.id} order={order} onClick={() => setSelectedOrder(order)} />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Insights */}
        <div className="space-y-8">
          {/* Waiter Performance */}
          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Star className="size-4 text-amber-500" /> Top Performers
            </h3>
            <WaiterLeaderboard orders={todayOrders} users={users} />
          </div>

          {/* Quick Actions */}
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl p-6 text-white shadow-xl shadow-gray-200">
            <h3 className="font-bold mb-4">Quick Insights</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-white/10 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/10 rounded-lg">
                    <Users className="size-4 text-blue-300" />
                  </div>
                  <span className="text-xs font-medium">Active Staff</span>
                </div>
                <span className="text-sm font-bold">{users.filter(u => u.status === 'active').length}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-white/10 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/10 rounded-lg">
                    <Package className="size-4 text-emerald-300" />
                  </div>
                  <span className="text-xs font-medium">Total Products</span>
                </div>
                <span className="text-sm font-bold">{products.length}</span>
              </div>
              <button className="w-full mt-2 py-3 bg-white text-gray-900 rounded-2xl font-black text-sm hover:bg-gray-100 transition-colors">
                View Detailed Reports
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
      )}
    </div>
  );
}
