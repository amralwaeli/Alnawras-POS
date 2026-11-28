import { useEffect, useState } from 'react';
import { usePOS } from '../../context/POSContext';
import { fmt } from '../../../lib/currency';
import { friendlyError } from '../../../lib/errors';
import { ReportsController, CompletedOrderRow } from '../../controllers/ReportsController';
import { BillDialog } from './BillDialog';

/** Today's paid bills for cashiers (who can't open Reports), so they can view and refund them. */
export function PaidBillsView() {
  const { currentUser } = usePOS();
  const [orders, setOrders] = useState<CompletedOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openBill, setOpenBill] = useState<string | null>(null);
  const branchId = currentUser?.branchId;

  useEffect(() => {
    if (!branchId) return;
    let cancelled = false;
    const from = new Date(); from.setHours(0, 0, 0, 0);
    ReportsController.getCompletedOrders(branchId, from, new Date(), 300, true).then(res => {
      if (cancelled) return;
      if (res.success) { setOrders(res.data!); setError(''); } else setError(friendlyError(res.error, 'Could not load the bills'));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [branchId]);

  if (!currentUser) return null;
  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-4 sm:p-6 space-y-4 max-w-5xl">
        <h1 className="text-2xl font-bold text-gray-900">Paid bills today</h1>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="bg-gray-50 text-left">
                  {['Bill', 'Table / Type', 'Taken by', 'Total', 'Paid at', ''].map(h => (
                    <th key={h} className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {orders.map(o => (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-sm font-mono text-gray-600">#{o.billNumber ?? '—'}</td>
                    <td className="px-5 py-3 text-sm font-medium text-gray-900">{o.orderType === 'dine-in' ? `Table ${o.tableNumber}` : o.orderType}</td>
                    <td className="px-5 py-3 text-sm text-gray-600 break-words" dir="auto">{o.takenBy}</td>
                    <td className="px-5 py-3 text-sm font-bold text-gray-900 whitespace-nowrap">{fmt(o.total)}</td>
                    <td className="px-5 py-3 text-sm text-gray-500 whitespace-nowrap">{o.completedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => setOpenBill(o.id)} aria-label={`View bill ${o.billNumber ?? ''}`}
                        className="min-h-11 text-xs font-semibold px-3 py-2 bg-white border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">
                        View
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && orders.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-500 text-sm">No bills paid today</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <BillDialog orderId={openBill} onClose={() => setOpenBill(null)} />
    </div>
  );
}
