import { usePOS } from '../context/POSContext';
import { useNavigate } from 'react-router';
import { UtensilsCrossed, Users, DollarSign, Clock } from 'lucide-react';

const statusConfig = {
  available: { label: 'Available', dot: 'bg-emerald-500', card: 'border-gray-100 bg-white', badge: 'bg-emerald-50 text-emerald-700' },
  occupied:  { label: 'Occupied',  dot: 'bg-blue-500',    card: 'border-blue-200 bg-blue-50/30', badge: 'bg-blue-50 text-blue-700' },
  reserved:  { label: 'Reserved',  dot: 'bg-amber-500',   card: 'border-amber-200 bg-amber-50/30', badge: 'bg-amber-50 text-amber-700' },
};

export function TablesView() {
  const { tables, orders, currentUser } = usePOS();
  const navigate = useNavigate();
  if (!currentUser) return null;

  const visibleTables = currentUser.role === 'cashier'
    ? tables.filter(t => t.assignedCashierId === currentUser.id)
    : tables;

  const getOrder = (tableId: string) => {
    const t = tables.find(t => t.id === tableId);
    if (!t?.currentOrderId) return null;
    return orders.find(o => o.id === t.currentOrderId) ?? null;
  };

  const available = tables.filter(t => t.status === 'available').length;
  const occupied  = tables.filter(t => t.status === 'occupied').length;

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-6 space-y-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tables</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              {currentUser.role === 'cashier' ? 'Your assigned tables' : 'All restaurant tables'}
            </p>
          </div>
          <div className="flex gap-3">
            <div className="text-center bg-white rounded-xl px-4 py-2 border border-gray-100">
              <p className="text-xl font-bold text-emerald-600">{available}</p>
              <p className="text-xs text-gray-400">Available</p>
            </div>
            <div className="text-center bg-white rounded-xl px-4 py-2 border border-gray-100">
              <p className="text-xl font-bold text-blue-600">{occupied}</p>
              <p className="text-xs text-gray-400">Occupied</p>
            </div>
          </div>
        </div>

        {/* Tables grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {visibleTables.map(table => {
            const order = getOrder(table.id);
            const cfg = statusConfig[table.status];

            return (
              <div key={table.id} className={`rounded-2xl border-2 p-4 cursor-pointer hover:shadow-md transition-all ${cfg.card}`}>
                {/* Table header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="size-10 bg-gray-100 rounded-xl flex items-center justify-center">
                    <UtensilsCrossed className="size-5 text-gray-600" />
                  </div>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${cfg.badge}`}>
                    <span className={`size-1.5 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </span>
                </div>

                <p className="font-bold text-gray-900 text-lg">Table {table.number}</p>
                <p className="text-xs text-gray-400 mb-3 flex items-center gap-1">
                  <Users className="size-3" /> {table.capacity} seats
                </p>

                {order ? (
                  <div className="space-y-2">
                    <div className="bg-white/80 rounded-xl p-2.5 space-y-1.5 border border-black/5">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Items</span>
                        <span className="font-medium">{order.items.length}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500 flex items-center gap-1"><DollarSign className="size-3" />Total</span>
                        <span className="font-bold text-gray-900">SAR {order.total.toFixed(2)}</span>
                      </div>
                    </div>
                    {currentUser.role === 'cashier' && (
                      <button className="w-full py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 transition-colors">
                        Process Payment
                      </button>
                    )}
                    {currentUser.role === 'waiter' && (
                      <button onClick={() => navigate(`/table/${table.id}`)} className="w-full py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-colors">
                        Add Items
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {currentUser.role === 'waiter' && (
                      <button onClick={() => navigate(`/table/${table.id}`)} className="w-full py-2 bg-gray-900 text-white rounded-xl text-xs font-semibold hover:bg-gray-800 transition-colors mt-1">
                        Start Order
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {visibleTables.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
            <UtensilsCrossed className="size-12 opacity-30" />
            <p className="text-sm">No tables available</p>
          </div>
        )}
      </div>
    </div>
  );
}
