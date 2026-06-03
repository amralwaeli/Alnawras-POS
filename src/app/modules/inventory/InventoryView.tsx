import { usePOS } from '../../context/POSContext';
import { Package, CheckCircle2, XCircle } from 'lucide-react';
import { fmt } from '../../../lib/currency';

export function InventoryView() {
  const { products, currentUser } = usePOS();
  if (!currentUser) return null;

  const available   = products.filter(p => (p.kitchenStatus || 'available') === 'available');
  const unavailable = products.filter(p => (p.kitchenStatus || 'available') !== 'available');

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-gray-500 text-sm mt-0.5">Product availability across the menu</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Total Products',  value: products.length,     icon: Package,       bg: 'bg-blue-50',    ic: 'bg-blue-100 text-blue-600',      vc: 'text-blue-700' },
            { label: 'Available',       value: available.length,    icon: CheckCircle2,  bg: 'bg-emerald-50', ic: 'bg-emerald-100 text-emerald-600', vc: 'text-emerald-700' },
            { label: 'Not Available',   value: unavailable.length,  icon: XCircle,       bg: 'bg-red-50',     ic: 'bg-red-100 text-red-600',         vc: 'text-red-700' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-2xl p-5 border border-black/5`}>
              <div className={`inline-flex size-10 items-center justify-center rounded-xl ${s.ic} mb-3`}>
                <s.icon className="size-5" />
              </div>
              <p className="text-sm text-gray-500 mb-0.5">{s.label}</p>
              <p className={`text-3xl font-bold ${s.vc}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {unavailable.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
            <strong>{unavailable.length} item{unavailable.length !== 1 ? 's' : ''} currently unavailable.</strong>
            {' '}Switch them back to available from the Kitchen screen.
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">All Products</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Product</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Category</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">Price</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide text-center">Availability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {products.map(p => {
                  const isAvailable = (p.kitchenStatus || 'available') === 'available';
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          {p.image
                            ? <img src={p.image} alt={p.name} className="size-9 object-cover rounded-lg bg-gray-100" />
                            : <div className="size-9 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-xs font-bold">{p.name[0]}</div>
                          }
                          <span className="font-medium text-sm text-gray-900">{p.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-500">{p.category}</td>
                      <td className="px-5 py-3.5 text-sm font-medium text-right">{fmt(p.price)}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${isAvailable ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                          {isAvailable ? 'Available' : 'Not Available'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
