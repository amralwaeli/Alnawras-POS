import { useEffect, useMemo, useState } from 'react';
import { usePOS } from '../../context/POSContext';
import { DollarSign, ShoppingCart, Package, TrendingUp, Download, ArrowUpDown } from 'lucide-react';
import { CURRENCY, orderTotal, fmt } from '../../../lib/currency';
import { downloadCsv } from '../../../lib/csv';
import { ReportsController, ProductSaleRow } from '../../controllers/ReportsController';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { periodRange, usePeriod, PeriodPicker } from './period';
import { ReportsController as RC, SalesSummary, CompletedOrderRow } from '../../controllers/ReportsController';
import { friendlyError } from '../../../lib/errors';

type SortKey = 'unitsSold' | 'revenue';

function ProductPerformanceTab({ branchId }: { branchId: string }) {
  const p = usePeriod('today');
  const { period, customFrom, customTo } = p;
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
      else setError(friendlyError(res.error, 'Failed to load product sales'));
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
        <PeriodPicker p={p} />
        <button
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="min-h-11 flex items-center gap-1.5 text-xs font-semibold px-3 py-2 bg-white border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          <Download className="size-3.5" /> Export CSV
        </button>
      </div>


      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-amber-50 rounded-2xl p-5 border border-amber-100">
          <p className="text-sm text-gray-500">Products Sold</p>
          <p className="text-xl sm:text-2xl font-bold text-amber-700">{rows.length}</p>
        </div>
        <div className="bg-blue-50 rounded-2xl p-5 border border-blue-100">
          <p className="text-sm text-gray-500">Total Units</p>
          <p className="text-xl sm:text-2xl font-bold text-blue-700">{totalUnits}</p>
        </div>
        <div className="bg-emerald-50 rounded-2xl p-5 border border-emerald-100 col-span-2 sm:col-span-1">
          <p className="text-sm text-gray-500">Total Revenue</p>
          <p className="text-xl sm:text-2xl font-bold text-emerald-700 break-words">{fmt(totalRevenue)}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px]">
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
                  <td className="px-5 py-3.5 text-sm font-medium text-gray-900 break-words" dir="auto">{r.productName}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-600">{r.unitsSold}</td>
                  <td className="px-5 py-3.5 text-sm font-bold text-gray-900 whitespace-nowrap">{fmt(r.revenue)}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-500 whitespace-nowrap">{fmt(r.unitsSold > 0 ? r.revenue / r.unitsSold : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ branchId }: { branchId: string }) {
  const p = usePeriod('today');
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [orders, setOrders] = useState<CompletedOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const { from, to } = p.range;
    Promise.all([RC.getSalesSummary(branchId, from, to), RC.getCompletedOrders(branchId, from, to)]).then(([s, o]) => {
      if (cancelled) return;
      if (s.success) { setSummary(s.data!); setError(''); } else setError(friendlyError(s.error, 'Could not load the report'));
      if (o.success) setOrders(o.data!);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [branchId, p.range]);

  const kpis = [
    { label: 'Revenue',       value: fmt(summary?.revenue ?? 0), icon: DollarSign,   bg: 'bg-emerald-50', ic: 'bg-emerald-100 text-emerald-600', vc: 'text-emerald-700' },
    { label: 'Bills Paid',    value: summary?.orders ?? 0,       icon: ShoppingCart, bg: 'bg-blue-50',    ic: 'bg-blue-100 text-blue-600',       vc: 'text-blue-700' },
    { label: 'Tax Collected', value: fmt(summary?.tax ?? 0),     icon: TrendingUp,   bg: 'bg-purple-50',  ic: 'bg-purple-100 text-purple-600',   vc: 'text-purple-700' },
    { label: 'Items Sold',    value: summary?.items ?? 0,        icon: Package,      bg: 'bg-amber-50',   ic: 'bg-amber-100 text-amber-600',     vc: 'text-amber-700' },
  ];

  return (
    <div className="space-y-6">
      <PeriodPicker p={p} />
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 ${loading ? 'opacity-50' : ''}`}>
        {kpis.map(s => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-4 sm:p-5 border border-black/5 min-w-0`}>
            <div className={`inline-flex size-10 items-center justify-center rounded-xl ${s.ic} mb-3`}><s.icon className="size-5" /></div>
            <p className="text-sm text-gray-500 mb-0.5">{s.label}</p>
            <p className={`text-xl sm:text-2xl font-bold break-words ${s.vc}`}>{s.value}</p>
          </div>
        ))}
      </div>
      {summary && Object.keys(summary.byMethod).length > 0 && (
        <div className="flex flex-wrap gap-2 text-sm text-gray-600">
          {Object.entries(summary.byMethod).map(([m, a]) => (
            <span key={m} className="bg-white border border-gray-100 rounded-xl px-3 py-1.5"><b className="uppercase">{m}</b> {fmt(Number(a))}</span>
          ))}
          {summary.discount > 0 && <span className="bg-white border border-gray-100 rounded-xl px-3 py-1.5">Discounts {fmt(summary.discount)}</span>}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Paid Bills</h2>
          {orders.length >= 300 && <p className="text-xs text-gray-500 mt-0.5">Showing the latest 300 — the totals above include all.</p>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="bg-gray-50 text-left">
                {['Bill', 'Table / Type', 'Payment', 'Total', 'Paid at'].map(h => (
                  <th key={h} className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.map(o => (
                <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5 text-sm font-mono text-gray-600">#{o.billNumber ?? '—'}</td>
                  <td className="px-5 py-3.5 text-sm font-medium text-gray-900">{o.orderType === 'dine-in' ? `Table ${o.tableNumber}` : o.orderType}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-600">{o.paymentMethod ?? '—'}</td>
                  <td className="px-5 py-3.5 text-sm font-bold text-gray-900 whitespace-nowrap">{fmt(o.total)}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-500 whitespace-nowrap">{o.completedAt.toLocaleString()}</td>
                </tr>
              ))}
              {!loading && orders.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-500 text-sm">No bills paid in this period</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function ReportsView() {
  const { currentUser } = usePOS();
  if (!currentUser) return null;

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-4 sm:p-6 space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-500 text-sm mt-0.5">Sales by the date bills were paid</p>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="products">Product Performance</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <OverviewTab branchId={currentUser.branchId} />
          </TabsContent>

          <TabsContent value="products" className="mt-4">
            <ProductPerformanceTab branchId={currentUser.branchId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
