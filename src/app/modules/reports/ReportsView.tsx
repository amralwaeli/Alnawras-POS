import { useEffect, useMemo, useState } from 'react';
import { usePOS } from '../../context/POSContext';
import { DollarSign, ShoppingCart, Package, TrendingUp, Download, ArrowUpDown } from 'lucide-react';
import { CURRENCY, orderTotal, fmt } from '../../../lib/currency';
import { downloadCsv } from '../../../lib/csv';
import { ReportsController, ProductSaleRow } from '../../controllers/ReportsController';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';

type Period = 'today' | 'week' | 'month' | 'custom';
type SortKey = 'unitsSold' | 'revenue';

function periodRange(period: Period, customFrom: string, customTo: string): { from: Date; to: Date } {
  const now = new Date();
  if (period === 'today') {
    const from = new Date(now); from.setHours(0, 0, 0, 0);
    const to = new Date(from); to.setDate(to.getDate() + 1);
    return { from, to };
  }
  if (period === 'week') {
    const from = new Date(now); from.setDate(from.getDate() - 7); from.setHours(0, 0, 0, 0);
    const to = new Date(now); to.setDate(to.getDate() + 1); to.setHours(0, 0, 0, 0);
    return { from, to };
  }
  if (period === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { from, to };
  }
  // custom
  const from = customFrom ? new Date(customFrom + 'T00:00:00') : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = customTo ? new Date(customTo + 'T23:59:59.999') : now;
  return { from, to };
}

function ProductPerformanceTab({ branchId }: { branchId: string }) {
  const [period, setPeriod] = useState<Period>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [rows, setRows] = useState<ProductSaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('unitsSold');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (!branchId) return;
    let cancelled = false;
    setLoading(true);
    const { from, to } = periodRange(period, customFrom, customTo);
    ReportsController.getProductSales(branchId, from, to).then(res => {
      if (cancelled) return;
      if (res.success) { setRows(res.data!); setError(''); }
      else setError(res.error || 'Failed to load product sales');
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [branchId, period, customFrom, customTo]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => (a[sortKey] - b[sortKey]) * (sortDir === 'asc' ? 1 : -1));
    return copy;
  }, [rows, sortKey, sortDir]);

  const totalUnits = rows.reduce((s, r) => s + r.unitsSold, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const exportCsv = () => {
    const { from, to } = periodRange(period, customFrom, customTo);
    const header = ['Product', 'Units Sold', `Revenue (${CURRENCY})`, `Avg Price (${CURRENCY})`];
    const rowsOut = sorted.map(r => [
      r.productName, r.unitsSold, r.revenue.toFixed(2),
      (r.unitsSold > 0 ? r.revenue / r.unitsSold : 0).toFixed(2),
    ]);
    downloadCsv(`product-sales-${from.toISOString().split('T')[0]}_${to.toISOString().split('T')[0]}.csv`, [header, ...rowsOut]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(['today', 'week', 'month', 'custom'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold capitalize transition-colors ${
                period === p ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p === 'today' ? 'Today' : p === 'week' ? 'Last 7 Days' : p === 'month' ? 'This Month' : 'Custom'}
            </button>
          ))}
        </div>
        <button
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 bg-white border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          <Download className="size-3.5" /> Export CSV
        </button>
      </div>

      {period === 'custom' && (
        <div className="flex items-center gap-2">
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-amber-50 rounded-2xl p-5 border border-amber-100">
          <p className="text-sm text-gray-500">Products Sold</p>
          <p className="text-2xl font-bold text-amber-700">{rows.length}</p>
        </div>
        <div className="bg-blue-50 rounded-2xl p-5 border border-blue-100">
          <p className="text-sm text-gray-500">Total Units</p>
          <p className="text-2xl font-bold text-blue-700">{totalUnits}</p>
        </div>
        <div className="bg-emerald-50 rounded-2xl p-5 border border-emerald-100 col-span-2 sm:col-span-1">
          <p className="text-sm text-gray-500">Total Revenue</p>
          <p className="text-2xl font-bold text-emerald-700">{fmt(totalRevenue)}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Product</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  <button onClick={() => toggleSort('unitsSold')} className="flex items-center gap-1 hover:text-gray-600">
                    Units Sold <ArrowUpDown className="size-3" />
                  </button>
                </th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  <button onClick={() => toggleSort('revenue')} className="flex items-center gap-1 hover:text-gray-600">
                    Revenue <ArrowUpDown className="size-3" />
                  </button>
                </th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Avg Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={4} className="px-5 py-12 text-center text-gray-400 text-sm">Loading…</td></tr>
              ) : error ? (
                <tr><td colSpan={4} className="px-5 py-12 text-center text-red-500 text-sm">{error}</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-12 text-center text-gray-400 text-sm">No sales in this period</td></tr>
              ) : sorted.map(r => (
                <tr key={r.productId} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5 text-sm font-medium text-gray-900">{r.productName}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-600">{r.unitsSold}</td>
                  <td className="px-5 py-3.5 text-sm font-bold text-gray-900">{fmt(r.revenue)}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-500">{fmt(r.unitsSold > 0 ? r.revenue / r.unitsSold : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function ReportsView() {
  const { orders, currentUser } = usePOS();
  if (!currentUser) return null;

  const completed     = orders.filter(o => o.status === 'completed');
  const totalRevenue  = completed.reduce((s, o) => s + orderTotal(o), 0);
  const totalTax      = completed.reduce((s, o) => s + Number(o.tax ?? 0), 0);
  const totalItems    = orders.reduce(
    (s, o) => s + (o.items ?? []).reduce((ss: number, i: any) => ss + Number(i.quantity ?? 1), 0),
    0
  );

  const statusCfg: Record<string, string> = {
    completed: 'bg-emerald-50 text-emerald-700',
    open:      'bg-blue-50 text-blue-700',
    cancelled: 'bg-gray-100 text-gray-500',
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-6 space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-500 text-sm mt-0.5">Sales analytics and performance metrics</p>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="products">Product Performance</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Revenue',  value: fmt(totalRevenue), icon: DollarSign, bg: 'bg-emerald-50', ic: 'bg-emerald-100 text-emerald-600', vc: 'text-emerald-700' },
                { label: 'Total Orders',   value: orders.length,      icon: ShoppingCart, bg: 'bg-blue-50', ic: 'bg-blue-100 text-blue-600', vc: 'text-blue-700' },
                { label: 'Tax Collected',  value: fmt(totalTax),      icon: TrendingUp, bg: 'bg-purple-50', ic: 'bg-purple-100 text-purple-600', vc: 'text-purple-700' },
                { label: 'Items Sold',     value: totalItems,          icon: Package, bg: 'bg-amber-50', ic: 'bg-amber-100 text-amber-600', vc: 'text-amber-700' },
              ].map(s => (
                <div key={s.label} className={`${s.bg} rounded-2xl p-5 border border-black/5`}>
                  <div className={`inline-flex size-10 items-center justify-center rounded-xl ${s.ic} mb-3`}><s.icon className="size-5" /></div>
                  <p className="text-sm text-gray-500 mb-0.5">{s.label}</p>
                  <p className={`text-2xl font-bold ${s.vc}`}>{s.value}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Order History</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      {['Order ID', 'Table', 'Items', 'Total', 'Status', 'Date'].map(h => (
                        <th key={h} className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {orders.map(o => (
                      <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3.5 font-mono text-xs text-gray-400">{o.id.slice(0, 8)}…</td>
                        <td className="px-5 py-3.5 text-sm font-medium text-gray-900">Table {o.tableNumber}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-600">{(o.items ?? []).length}</td>
                        <td className="px-5 py-3.5 text-sm font-bold text-gray-900">{fmt(orderTotal(o))}</td>
                        <td className="px-5 py-3.5">
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusCfg[o.status] ?? 'bg-gray-100 text-gray-500'}`}>{o.status}</span>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-400">{new Date(o.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                    {orders.length === 0 && (
                      <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400 text-sm">No orders found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="products" className="mt-4">
            <ProductPerformanceTab branchId={currentUser.branchId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
