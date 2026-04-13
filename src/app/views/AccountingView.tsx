import { usePOS } from '../context/POSContext';
import { TrendingUp, TrendingDown, DollarSign, Download } from 'lucide-react';
import { orderTotal, fmt } from '../../lib/currency';

const expenseCategories = ['utilities', 'supplies', 'rent', 'salary', 'maintenance', 'other'];
const catColors: Record<string, string> = {
  utilities: 'bg-blue-500', supplies: 'bg-purple-500', rent: 'bg-amber-500',
  salary: 'bg-emerald-500', maintenance: 'bg-orange-500', other: 'bg-gray-400',
};

export function AccountingView() {
  const { expenses, orders, currentUser } = usePOS();
  if (!currentUser) return null;

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const totalRevenue  = orders.filter(o => o.status === 'completed').reduce((s, o) => s + orderTotal(o), 0);
  const netIncome     = totalRevenue - totalExpenses;

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-6 space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Accounting</h1>
          <p className="text-gray-500 text-sm mt-0.5">Financial overview and expense tracking</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-emerald-50 rounded-2xl p-5 border border-emerald-100">
            <div className="inline-flex size-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 mb-3"><TrendingUp className="size-5" /></div>
            <p className="text-sm text-gray-500">Total Revenue</p>
            <p className="text-2xl font-bold text-emerald-700">{fmt(totalRevenue)}</p>
          </div>
          <div className="bg-red-50 rounded-2xl p-5 border border-red-100">
            <div className="inline-flex size-10 items-center justify-center rounded-xl bg-red-100 text-red-600 mb-3"><TrendingDown className="size-5" /></div>
            <p className="text-sm text-gray-500">Total Expenses</p>
            <p className="text-2xl font-bold text-red-700">{fmt(totalExpenses)}</p>
          </div>
          <div className={`${netIncome >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'} rounded-2xl p-5 border`}>
            <div className={`inline-flex size-10 items-center justify-center rounded-xl ${netIncome >= 0 ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'} mb-3`}><DollarSign className="size-5" /></div>
            <p className="text-sm text-gray-500">Net Income</p>
            <p className={`text-2xl font-bold ${netIncome >= 0 ? 'text-blue-700' : 'text-red-700'}`}>{fmt(netIncome)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Expenses list */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Recent Expenses</h2>
              <button className="text-xs font-medium px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors">+ Add</button>
            </div>
            <div className="divide-y divide-gray-50">
              {expenses.slice(0, 10).map(e => (
                <div key={e.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{e.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`inline-block size-2 rounded-full ${catColors[e.category] ?? 'bg-gray-400'}`} />
                      <span className="text-xs text-gray-400 capitalize">{e.category}</span>
                      <span className="text-xs text-gray-300">·</span>
                      <span className="text-xs text-gray-400">{new Date(e.date).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-red-600">-{fmt(e.amount)}</p>
                </div>
              ))}
              {expenses.length === 0 && (
                <div className="py-12 text-center text-gray-400 text-sm">No expenses recorded yet</div>
              )}
            </div>
          </div>

          {/* Breakdown */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Expense Breakdown</h2>
            </div>
            <div className="p-5 space-y-4">
              {expenseCategories.map(cat => {
                const total = expenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0);
                const pct = totalExpenses > 0 ? (total / totalExpenses) * 100 : 0;
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block size-2.5 rounded-full ${catColors[cat]}`} />
                        <span className="text-sm font-medium text-gray-700 capitalize">{cat}</span>
                      </div>
                      <span className="text-sm text-gray-500">{fmt(total)}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className={`${catColors[cat]} h-1.5 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Export */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Export Reports</h2>
          <div className="grid grid-cols-3 gap-3">
            {['Daily', 'Weekly', 'Monthly'].map(period => (
              <button key={period} className="flex items-center gap-3 p-4 border-2 border-gray-100 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all text-left">
                <Download className="size-4 text-gray-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-gray-800">{period} Report</p>
                  <p className="text-xs text-gray-400">{period === 'Daily' ? 'Today\'s data' : period === 'Weekly' ? 'Last 7 days' : 'Current month'}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
