import { usePOS } from '../../context/POSContext';
import { Package, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { fmt } from '../../../lib/currency';

export function InventoryView() {
  const { products, currentUser } = usePOS();
  if (!currentUser) return null;

  const low  = products.filter(p => p.stock > 0 && p.stock <= p.reorderPoint);
  const out  = products.filter(p => p.stock === 0);
  const ok   = products.filter(p => p.stock > p.reorderPoint);

  const getStatus = (p: typeof products[0]) => {
    if (p.stock === 0) return { label: 'Out of Stock', cls: 'bg-red-50 text-red-700' };
    if (p.stock <= p.reorderPoint) return { label: 'Low Stock', cls: 'bg-amber-50 text-amber-700' };
    return { label: 'In Stock', cls: 'bg-emerald-50 text-emerald-700' };
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-6 space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-gray-500 text-sm mt-0.5">Monitor stock levels across all products</p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'In Stock', value: ok.length, icon: CheckCircle2, bg: 'bg-emerald-50', ic: 'bg-emerald-100 text-emerald-600', vc: 'text-emerald-700' },
            { label: 'Low Stock', value: low.length, icon: AlertTriangle, bg: 'bg-amber-50', ic: 'bg-amber-100 text-amber-600', vc: 'text-amber-700' },
            { label: 'Out of Stock', value: out.length, icon: Package, bg: 'bg-red-50', ic: 'bg-red-100 text-red-600', vc: 'text-red-700' },
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

        {(low.length > 0 || out.length > 0) && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
            <strong>{out.length + low.length} item{out.length + low.length !== 1 ? 's' : ''} need attention.</strong>
            {' '}{out.length > 0 && `${out.length} out of stock.`} {low.length > 0 && `${low.length} running low.`}
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
                  <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">Stock</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">Reorder At</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">Price</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {products.map(p => {
                  const st = getStatus(p);
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
                      <td className="px-5 py-3.5 text-right">
                        <span className={`font-bold text-sm ${p.stock === 0 ? 'text-red-600' : p.stock <= p.reorderPoint ? 'text-amber-600' : 'text-gray-900'}`}>
                          {p.stock}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-400 text-right">{p.reorderPoint}</td>
                      <td className="px-5 py-3.5 text-sm font-medium text-right">{fmt(p.price)}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${st.cls}`}>{st.label}</span>
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
