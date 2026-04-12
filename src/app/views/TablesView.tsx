import { usePOS } from '../context/POSContext';
import { Table as TableIcon, Plus } from 'lucide-react';

export function TablesView() {
  const { tables, orders, currentUser } = usePOS();

  if (!currentUser) return null;

  // Filter tables based on role
  const visibleTables = currentUser.role === 'cashier'
    ? tables.filter(t => t.assignedCashierId === currentUser.id)
    : tables;

  const getTableOrder = (tableId: string) => {
    const table = tables.find(t => t.id === tableId);
    if (!table?.currentOrderId) return null;
    return orders.find(o => o.id === table.currentOrderId);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-100 border-green-300 text-green-700';
      case 'occupied':
        return 'bg-blue-100 border-blue-300 text-blue-700';
      case 'reserved':
        return 'bg-yellow-100 border-yellow-300 text-yellow-700';
      default:
        return 'bg-gray-100 border-gray-300 text-gray-700';
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-2xl">Tables</h1>
            <p className="text-gray-600">
              {currentUser.role === 'cashier'
                ? 'Your assigned tables for payment processing'
                : 'Manage table orders and assignments'
              }
            </p>
          </div>
          {currentUser.role === 'waiter' && (
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Plus className="size-4" />
              New Order
            </button>
          )}
        </div>

        <div className="grid grid-cols-4 gap-4">
          {visibleTables.map(table => {
            const order = getTableOrder(table.id);

            return (
              <div
                key={table.id}
                className={`border-2 rounded-lg p-6 ${getStatusColor(table.status)} cursor-pointer hover:shadow-lg transition-all`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <TableIcon className="size-5" />
                    <span className="font-semibold text-lg">Table {table.number}</span>
                  </div>
                  <span className="text-xs px-2 py-1 bg-white/50 rounded capitalize">
                    {table.status}
                  </span>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Capacity:</span>
                    <span className="font-medium">{table.capacity} seats</span>
                  </div>

                  {order && (
                    <>
                      <div className="pt-2 border-t border-current/20">
                        <div className="flex justify-between">
                          <span>Items:</span>
                          <span className="font-medium">{order.items.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Total:</span>
                          <span className="font-semibold">${order.total.toFixed(2)}</span>
                        </div>
                      </div>

                      {currentUser.role === 'admin' && order.waiters.length > 0 && (
                        <div className="pt-2 border-t border-current/20">
                          <span className="text-xs">Waiters: {order.waiters.length}</span>
                        </div>
                      )}

                      {currentUser.role === 'cashier' && (
                        <button className="w-full mt-3 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors">
                          Process Payment
                        </button>
                      )}

                      {currentUser.role === 'waiter' && (
                        <button className="w-full mt-3 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                          Add Items
                        </button>
                      )}
                    </>
                  )}

                  {!order && currentUser.role === 'waiter' && (
                    <button className="w-full mt-3 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                      Start Order
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {visibleTables.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <TableIcon className="size-16 mb-4" />
            <p>No tables available</p>
          </div>
        )}
      </div>
    </div>
  );
}
