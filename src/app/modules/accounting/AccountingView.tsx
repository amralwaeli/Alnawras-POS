import { useEffect, useState } from 'react';
import { usePOS } from '../../context/POSContext';
import { TrendingUp, TrendingDown, DollarSign, Download, Plus, X } from 'lucide-react';
import { orderTotal, fmt } from '../../../lib/currency';
import { supabase } from '../../../lib/supabase';
import { toast } from 'sonner';

const expenseCategories = ['utilities', 'supplies', 'rent', 'salary', 'maintenance', 'other'];
const catColors: Record<string, string> = {
  utilities: 'bg-blue-500', supplies: 'bg-purple-500', rent: 'bg-amber-500',
  salary: 'bg-emerald-500', maintenance: 'bg-orange-500', other: 'bg-gray-400',
};

const defaultForm = () => ({
  description: '',
  category: 'utilities',
  amount: '',
  date: new Date().toISOString().split('T')[0],
});

export function AccountingView() {
  const { expenses, orders, currentUser, setExpenses } = usePOS();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(defaultForm());
  const [saving, setSaving] = useState(false);

  if (!currentUser) return null;

  // ── Load expenses from Supabase on mount ─────────────────────────────────
  useEffect(() => {
    if (!currentUser?.branchId) return;
    supabase
      .from('expenses')
      .select('*')
      .eq('branch_id', currentUser.branchId)
      .order('date', { ascending: false })
      .then(({ data }) => {
        if (data) setExpenses(data.map((e: any) => ({
          id: e.id,
          branchId: e.branch_id,
          category: e.category,
          description: e.description,
          amount: Number(e.amount),
          date: new Date(e.date),
          createdBy: e.created_by,
          createdByName: e.created_by_name,
          status: e.status ?? 'approved',
          receipt: e.receipt,
        })));
      });
  }, [currentUser?.branchId]);

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const totalRevenue  = orders.filter(o => o.status === 'completed').reduce((s, o) => s + orderTotal(o), 0);
  const netIncome     = totalRevenue - totalExpenses;

  // ── Save new expense ──────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.description.trim() || !form.amount) { toast.error('Fill in all fields'); return; }
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) { toast.error('Enter a valid amount'); return; }
    setSaving(true);
    const id = `exp-${Date.now()}`;
    const { error } = await supabase.from('expenses').insert([{
      id,
      branch_id:        currentUser.branchId,
      category:         form.category,
      description:      form.description.trim(),
      amount,
      date:             form.date,
      created_by:       currentUser.id,
      created_by_name:  currentUser.name,
      status:           'approved',
    }]);
    if (error) {
      toast.error('Failed to save expense');
      setSaving(false);
      return;
    }
    setExpenses(prev => [{
      id, branchId: currentUser.branchId, category: form.category,
      description: form.description.trim(), amount,
      date: new Date(form.date), createdBy: currentUser.id,
      createdByName: currentUser.name, status: 'approved',
    }, ...prev]);
    toast.success('Expense added');
    setShowModal(false);
    setForm(defaultForm());
    setSaving(false);
  };

  // ── Export CSV ────────────────────────────────────────────────────────────
  const exportCSV = (period: 'Daily' | 'Weekly' | 'Monthly') => {
    const now   = new Date();
    let start   = new Date();
    if (period === 'Daily')        { start.setHours(0, 0, 0, 0); }
    else if (period === 'Weekly')  { start.setDate(now.getDate() - 7); start.setHours(0, 0, 0, 0); }
    else                           { start = new Date(now.getFullYear(), now.getMonth(), 1); }

    const rows: string[][] = [['Date', 'Type', 'Description', 'Category', 'Amount (RM)']];

    orders
      .filter(o => o.status === 'completed' && new Date(o.createdAt) >= start)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .forEach(o => rows.push([
        new Date(o.createdAt).toLocaleDateString('en-GB'),
        'Revenue',
        `Order - ${o.orderType === 'takeaway' ? 'Takeaway' : `Table ${o.tableNumber}`}`,
        'sales',
        orderTotal(o).toFixed(2),
      ]));

    expenses
      .filter(e => new Date(e.date) >= start)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .forEach(e => rows.push([
        new Date(e.date).toLocaleDateString('en-GB'),
        'Expense',
        e.description,
        e.category,
        `-${e.amount.toFixed(2)}`,
      ]));

    const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `alnawras-${period.toLowerCase()}-${now.toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`${period} report downloaded`);
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Accounting</h1>
          <p className="text-gray-500 text-sm mt-0.5">Financial overview and expense tracking</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              <button
                onClick={() => { setForm(defaultForm()); setShowModal(true); }}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                <Plus className="size-3.5" /> Add
              </button>
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
                      <span className="text-xs text-gray-400">{new Date(e.date).toLocaleDateString('en-GB')}</span>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-red-600 shrink-0 ml-3">-{fmt(e.amount)}</p>
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
                const pct   = totalExpenses > 0 ? (total / totalExpenses) * 100 : 0;
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
          <h2 className="font-semibold text-gray-900 mb-1">Export Reports</h2>
          <p className="text-xs text-gray-400 mb-4">Downloads a CSV file with revenue and expense data</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(['Daily', 'Weekly', 'Monthly'] as const).map(period => (
              <button
                key={period}
                onClick={() => exportCSV(period)}
                className="flex items-center gap-3 p-4 border-2 border-gray-100 rounded-xl hover:border-amber-400 hover:bg-amber-50 transition-all text-left group"
              >
                <Download className="size-4 text-gray-400 group-hover:text-amber-600 shrink-0 transition-colors" />
                <div>
                  <p className="text-sm font-semibold text-gray-800">{period} Report</p>
                  <p className="text-xs text-gray-400">
                    {period === 'Daily' ? "Today's data" : period === 'Weekly' ? 'Last 7 days' : 'Current month'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Add Expense Modal ── */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={e => e.target === e.currentTarget && setShowModal(false)}
        >
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-lg text-gray-900">Add Expense</h3>
              <button onClick={() => setShowModal(false)} className="size-8 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors">
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="e.g. Electricity bill"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                >
                  {expenseCategories.map(c => (
                    <option key={c} value={c} className="capitalize">{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount (RM) *</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? 'Saving…' : 'Save Expense'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
