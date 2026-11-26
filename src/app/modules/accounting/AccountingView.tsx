import { addExpense } from '../../controllers/ExpenseController';
import { useEffect, useState } from 'react';
import { usePOS } from '../../context/POSContext';
import { TrendingUp, TrendingDown, DollarSign, Download, Plus, X } from 'lucide-react';
import { fmt } from '../../../lib/currency';
import { supabase } from '../../../lib/supabase';
import { downloadCsv } from '../../../lib/csv';
import { toast } from 'sonner';
import { usePeriod, PeriodPicker } from '../reports/period';
import { ReportsController } from '../../controllers/ReportsController';

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
  employeeId: '',
  fromDrawer: true,
});

export function AccountingView() {
  const { expenses, currentUser, setExpenses, users } = usePOS();
  const staff = users.filter(u => u.status === 'active' && u.role !== 'admin').sort((a, b) => a.name.localeCompare(b.name));
  // Revenue and expenses for the SAME chosen period (revenue used to be today's,
  // expenses all-time). Revenue comes from the database by date paid (0033).
  const p = usePeriod('month');
  const [revenue, setRevenue] = useState(0);
  useEffect(() => {
    if (!currentUser?.branchId) return;
    let cancelled = false;
    ReportsController.getSalesSummary(currentUser.branchId, p.range.from, p.range.to).then(r => {
      if (cancelled) return;
      if (r.success) setRevenue(r.data!.revenue); else toast.error(`Could not load revenue: ${r.error}`);
    });
    return () => { cancelled = true; };
  }, [currentUser?.branchId, p.range]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(defaultForm());
  const [saving, setSaving] = useState(false);

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
          employeeId: e.employee_id ?? undefined,
          employeeName: e.employee_name ?? undefined,
          fromDrawer: !!e.from_drawer,
        })));
      });
  }, [currentUser?.branchId]);

  if (!currentUser) return null;

  // ── Totals ────────────────────────────────────────────────────────────────
  const periodExpenses = expenses.filter(e => new Date(e.date) >= p.range.from && new Date(e.date) < p.range.to);
  const totalExpenses = periodExpenses.reduce((s, e) => s + e.amount, 0);
  const totalRevenue  = revenue;
  const netIncome     = totalRevenue - totalExpenses;

  // ── Save new expense ──────────────────────────────────────────────────────
  const handleSave = async () => {
    const employee = form.category === 'salary' ? staff.find(u => u.id === form.employeeId) : undefined;
    if (form.category === 'salary' && !employee) { toast.error('Choose the employee'); return; }
    // A salary / advance needs no description: the employee's name says who it was for.
    const description = form.description.trim() || (employee ? 'Salary / advance' : '');
    if (!description || !form.amount) { toast.error('Fill in all fields'); return; }
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) { toast.error('Enter a valid amount'); return; }
    setSaving(true);
    const res = await addExpense({ category: form.category, description, amount, date: form.date, employee, fromDrawer: form.fromDrawer }, currentUser);
    if (!res.success) {
      toast.error('Failed to save expense');
      setSaving(false);
      return;
    }
    setExpenses(prev => [res.expense!, ...prev]);
    toast.success('Expense added');
    setShowModal(false);
    setForm(defaultForm());
    setSaving(false);
  };

  // ── Export CSV: the period chosen at the top, bills fetched from the database ──
  const [exporting, setExporting] = useState(false);
  const exportCSV = async () => {
    setExporting(true);
    const { from, to } = p.range;
    const res = await ReportsController.getCompletedOrders(currentUser.branchId, from, to, 5000);
    setExporting(false);
    if (!res.success) { toast.error(`Export failed: ${res.error}`); return; }
    const rows: string[][] = [['Date', 'Type', 'Description', 'Category', 'Amount (RM)']];
    [...res.data!].reverse().forEach(o => rows.push([
      o.completedAt.toLocaleDateString('en-GB'),
      'Revenue',
      `Bill #${o.billNumber ?? '-'} - ${o.orderType === 'dine-in' ? `Table ${o.tableNumber}` : o.orderType}`,
      'sales',
      o.total.toFixed(2),
    ]));
    [...periodExpenses]
      .sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime())
      .forEach(e => rows.push([new Date(e.date).toLocaleDateString('en-GB'), 'Expense', e.employeeName ? `${e.employeeName} — ${e.description}` : e.description, e.category, `-${e.amount.toFixed(2)}`]));
    const day = (d: Date) => d.toISOString().split('T')[0];
    downloadCsv(`smartpos-${day(from)}-to-${day(new Date(to.getTime() - 1))}.csv`, rows);
    toast.success(res.data!.length >= 5000 ? 'Report downloaded (first 5000 bills)' : 'Report downloaded');
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Accounting</h1>
          <p className="text-gray-500 text-sm mt-0.5">Financial overview and expense tracking</p>
        </div>
        <PeriodPicker p={p} />

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-emerald-50 rounded-2xl p-5 border border-emerald-100">
            <div className="inline-flex size-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 mb-3"><TrendingUp className="size-5" /></div>
            <p className="text-sm text-gray-500">Total Revenue</p>
            <p className="text-2xl font-bold text-emerald-700 break-words">{fmt(totalRevenue)}</p>
          </div>
          <div className="bg-red-50 rounded-2xl p-5 border border-red-100">
            <div className="inline-flex size-10 items-center justify-center rounded-xl bg-red-100 text-red-600 mb-3"><TrendingDown className="size-5" /></div>
            <p className="text-sm text-gray-500">Total Expenses</p>
            <p className="text-2xl font-bold text-red-700 break-words">{fmt(totalExpenses)}</p>
          </div>
          <div className={`${netIncome >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'} rounded-2xl p-5 border`}>
            <div className={`inline-flex size-10 items-center justify-center rounded-xl ${netIncome >= 0 ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'} mb-3`}><DollarSign className="size-5" /></div>
            <p className="text-sm text-gray-500">Net Income</p>
            <p className={`text-2xl font-bold break-words ${netIncome >= 0 ? 'text-blue-700' : 'text-red-700'}`}>{fmt(netIncome)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Expenses list */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-4 sm:px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-gray-900">Recent Expenses</h2>
              <button
                onClick={() => { setForm(defaultForm()); setShowModal(true); }}
                className="min-h-11 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                <Plus className="size-3.5" /> Add
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {periodExpenses.slice(0, 10).map(e => (
                <div key={e.id} className="px-4 sm:px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 break-words" dir="auto">
                      {e.employeeName ? `${e.employeeName} — ` : ''}{e.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                      <span className={`inline-block size-2 rounded-full ${catColors[e.category] ?? 'bg-gray-400'}`} />
                      <span className="text-xs text-gray-400 capitalize">{e.category}</span>
                      <span className="text-xs text-gray-300">·</span>
                      <span className="text-xs text-gray-400">{new Date(e.date).toLocaleDateString('en-GB')}</span>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-red-600 shrink-0 ml-3 whitespace-nowrap">-{fmt(e.amount)}</p>
                </div>
              ))}
              {periodExpenses.length === 0 && (
                <div className="py-12 text-center text-gray-400 text-sm">No expenses in this period</div>
              )}
            </div>
          </div>

          {/* Breakdown */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Expense Breakdown</h2>
            </div>
            <div className="p-4 sm:p-5 space-y-4">
              {expenseCategories.map(cat => {
                const total = periodExpenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0);
                const pct   = totalExpenses > 0 ? (total / totalExpenses) * 100 : 0;
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block size-2.5 rounded-full ${catColors[cat]}`} />
                        <span className="text-sm font-medium text-gray-700 capitalize">{cat}</span>
                      </div>
                      <span className="text-sm text-gray-500 whitespace-nowrap">{fmt(total)}</span>
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
        <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
          <h2 className="font-semibold text-gray-900 mb-1">Export Reports</h2>
          <p className="text-xs text-gray-500 mb-4">Paid bills and expenses for the period chosen at the top</p>
          <button
            onClick={() => void exportCSV()}
            disabled={exporting}
            className="flex items-center gap-3 min-h-11 p-4 border-2 border-gray-100 rounded-xl hover:border-amber-400 hover:bg-amber-50 transition-all text-left group disabled:opacity-50"
          >
            <Download className="size-4 text-gray-500 group-hover:text-amber-600 shrink-0 transition-colors" />
            <span className="text-sm font-semibold text-gray-800">{exporting ? 'Preparing…' : 'Download CSV for the selected period'}</span>
          </button>
        </div>
      </div>

      {/* ── Add Expense Modal ── */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={e => e.target === e.currentTarget && setShowModal(false)}
        >
          <div className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-md max-h-[90dvh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-lg text-gray-900">Add Expense</h3>
              <button onClick={() => setShowModal(false)} aria-label="Close" className="size-11 -m-1.5 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors">
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
              {form.category === 'salary' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Employee *</label>
                  <select
                    value={form.employeeId}
                    onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                  >
                    <option value="">Choose the employee…</option>
                    {staff.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <label className="flex items-center gap-2 min-h-11 text-sm text-gray-700">
                <input type="checkbox" className="size-4 accent-gray-900" checked={form.fromDrawer}
                  onChange={e => setForm(f => ({ ...f, fromDrawer: e.target.checked }))} />
                Paid from the cash drawer (shown on the shift report)
              </label>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 min-h-11 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 min-h-11 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
