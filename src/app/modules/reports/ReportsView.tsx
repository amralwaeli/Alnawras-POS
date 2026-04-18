import { usePOS } from '../../context/POSContext';
import { DollarSign, ShoppingCart, Package, TrendingUp } from 'lucide-react';
import { CURRENCY, orderTotal, fmt } from '../../../lib/currency';

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
      </div>
    </div>
  );
}
