import { usePOS } from '../context/POSContext';
import { DollarSign, TrendingUp, TrendingDown, Calendar } from 'lucide-react';

export function AccountingView() {
  const { expenses, orders, currentUser } = usePOS();

  if (!currentUser) return null;

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const completedOrders = orders.filter(o => o.status === 'completed');
  const totalRevenue = completedOrders.reduce((sum, o) => sum + o.total, 0);
  const netIncome = totalRevenue - totalExpenses;

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="font-semibold text-2xl">Accounting</h1>
          <p className="text-gray-600">Track expenses, revenue, and financial reports</p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-lg border">
            <div className="flex items-center gap-3 mb-2">
              <div className="size-10 flex items-center justify-center bg-green-100 rounded-lg">
                <TrendingUp className="size-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Revenue</p>
                <p className="text-2xl font-semibold text-green-600">${totalRevenue.toFixed(2)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border">
            <div className="flex items-center gap-3 mb-2">
              <div className="size-10 flex items-center justify-center bg-red-100 rounded-lg">
                <TrendingDown className="size-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Expenses</p>
                <p className="text-2xl font-semibold text-red-600">${totalExpenses.toFixed(2)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border">
            <div className="flex items-center gap-3 mb-2">
              <div className={`size-10 flex items-center justify-center rounded-lg ${
                netIncome >= 0 ? 'bg-blue-100' : 'bg-red-100'
              }`}>
                <DollarSign className={`size-5 ${netIncome >= 0 ? 'text-blue-600' : 'text-red-600'}`} />
              </div>
              <div>
                <p className="text-sm text-gray-600">Net Income</p>
                <p className={`text-2xl font-semibold ${netIncome >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  ${netIncome.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white rounded-lg border">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-semibold">Recent Expenses</h2>
              <button className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
                Add Expense
              </button>
            </div>
            <div className="p-4 space-y-3">
              {expenses.slice(0, 10).map(expense => (
                <div key={expense.id} className="flex items-start justify-between pb-3 border-b last:border-0">
                  <div>
                    <p className="font-medium">{expense.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-2 py-0.5 bg-gray-100 rounded capitalize">
                        {expense.category}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(expense.date).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <p className="font-semibold text-red-600">-${expense.amount.toFixed(2)}</p>
                </div>
              ))}
              {expenses.length === 0 && (
                <p className="text-center text-gray-400 py-8">No expenses recorded</p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg border">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-semibold">Expense Breakdown</h2>
              <Calendar className="size-5 text-gray-400" />
            </div>
            <div className="p-4 space-y-3">
              {['utilities', 'supplies', 'rent', 'salary', 'maintenance', 'other'].map(category => {
                const categoryExpenses = expenses.filter(e => e.category === category);
                const total = categoryExpenses.reduce((sum, e) => sum + e.amount, 0);
                const percentage = totalExpenses > 0 ? (total / totalExpenses) * 100 : 0;

                return (
                  <div key={category}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm capitalize font-medium">{category}</span>
                      <span className="text-sm text-gray-600">${total.toFixed(2)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border p-6">
          <h2 className="font-semibold mb-4">Export Reports</h2>
          <div className="grid grid-cols-3 gap-4">
            <button className="px-4 py-3 border-2 border-gray-300 rounded-lg hover:border-blue-600 hover:bg-blue-50 transition-colors">
              <p className="font-medium">Daily Report</p>
              <p className="text-sm text-gray-600">Export today's data</p>
            </button>
            <button className="px-4 py-3 border-2 border-gray-300 rounded-lg hover:border-blue-600 hover:bg-blue-50 transition-colors">
              <p className="font-medium">Weekly Report</p>
              <p className="text-sm text-gray-600">Last 7 days</p>
            </button>
            <button className="px-4 py-3 border-2 border-gray-300 rounded-lg hover:border-blue-600 hover:bg-blue-50 transition-colors">
              <p className="font-medium">Monthly Report</p>
              <p className="text-sm text-gray-600">Current month</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
