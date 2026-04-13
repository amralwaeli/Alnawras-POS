import { usePOS } from '../context/POSContext';
import { CheckCircle2, XCircle, Clock4 } from 'lucide-react';

type KitchenStatus = 'available' | 'out-of-stock' | 'finished';

const statusConfig: Record<KitchenStatus, { label: string; badge: string; dot: string }> = {
  available:    { label: 'Available',    badge: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  finished:     { label: 'Finished',     badge: 'bg-amber-50 text-amber-700',     dot: 'bg-amber-500' },
  'out-of-stock': { label: 'Out of Stock', badge: 'bg-red-50 text-red-700',       dot: 'bg-red-500' },
};

export function KitchenView() {
  const { products, currentUser, updateProduct } = usePOS();
  if (!currentUser) return null;

  const set = (id: string, status: KitchenStatus) => updateProduct(id, { kitchenStatus: status });

  const counts = {
    available: products.filter(p => p.kitchenStatus === 'available').length,
    finished:  products.filter(p => p.kitchenStatus === 'finished').length,
    'out-of-stock': products.filter(p => p.kitchenStatus === 'out-of-stock').length,
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-6 space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kitchen</h1>
          <p className="text-gray-500 text-sm mt-0.5">Mark items as available, finished, or out of stock</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {(['available', 'finished', 'out-of-stock'] as KitchenStatus[]).map(s => {
            const icons = { available: CheckCircle2, finished: Clock4, 'out-of-stock': XCircle };
            const Icon = icons[s];
            const bg = { available: 'bg-emerald-50', finished: 'bg-amber-50', 'out-of-stock': 'bg-red-50' }[s];
            const ic = { available: 'bg-emerald-100 text-emerald-600', finished: 'bg-amber-100 text-amber-600', 'out-of-stock': 'bg-red-100 text-red-600' }[s];
            const vc = { available: 'text-emerald-700', finished: 'text-amber-700', 'out-of-stock': 'text-red-700' }[s];
            return (
              <div key={s} className={`${bg} rounded-2xl p-5 border border-black/5`}>
                <div className={`inline-flex size-10 items-center justify-center rounded-xl ${ic} mb-3`}>
                  <Icon className="size-5" />
                </div>
                <p className="text-sm text-gray-500 mb-0.5 capitalize">{statusConfig[s].label}</p>
                <p className={`text-3xl font-bold ${vc}`}>{counts[s]}</p>
              </div>
            );
          })}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <strong>Note:</strong> Marking items as Finished or Out of Stock hides them from the customer menu. Existing orders are not affected.
        </div>

        {/* Product table */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Product Status</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Product</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Category</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">Stock</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide text-center">Status</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {products.map(p => {
                  const cfg = statusConfig[p.kitchenStatus];
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
                      <td className="px-5 py-3.5 text-sm font-medium text-right">{p.stock}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cfg.badge}`}>
                          <span className={`size-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex justify-end gap-1.5">
                          {p.kitchenStatus !== 'available' && (
                            <button onClick={() => set(p.id, 'available')} className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">Available</button>
                          )}
                          {p.kitchenStatus !== 'finished' && (
                            <button onClick={() => set(p.id, 'finished')} className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors">Finished</button>
                          )}
                          {p.kitchenStatus !== 'out-of-stock' && (
                            <button onClick={() => set(p.id, 'out-of-stock')} className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition-colors">Out of Stock</button>
                          )}
                        </div>
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
