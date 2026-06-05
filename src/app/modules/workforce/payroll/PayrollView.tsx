import { useState, useEffect } from 'react';
import { DollarSign, RefreshCw, TrendingUp, Download, CheckCircle } from 'lucide-react';
import { usePOS } from '../../../context/POSContext';
import { HRController } from '../../../controllers/HRController';
import { WorkforceController } from '../../../controllers/WorkforceController';
import { PayrollSummary, EmployeeWithUser } from '../../../models/types';

const cur = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PayrollView() {
  const { currentUser } = usePOS();
  const now  = new Date();
  const [month, setMonth]       = useState(now.getMonth() + 1);
  const [year, setYear]         = useState(now.getFullYear());
  const [payroll, setPayroll]   = useState<PayrollSummary[]>([]);
  const [loading, setLoading]   = useState(false);
  const [computing, setComputing] = useState('');
  const [error, setError]       = useState('');

  const load = async () => {
    setLoading(true);
    const r = await HRController.getPayroll(month, year);
    if (r.success) setPayroll(r.data ?? []);
    else setError(r.error ?? 'Failed to load payroll');
    setLoading(false);
  };

  useEffect(() => { load(); }, [month, year]);

  const computeAll = async () => {
    if (!currentUser) return;
    const empResult = await WorkforceController.getEmployees({ status: 'active' });
    if (!empResult.success) { setError(empResult.error); return; }

    for (const emp of empResult.data) {
      setComputing(emp.fullName);
      await HRController.computePayroll(emp.employeeId, month, year, currentUser.id);
    }
    setComputing('');
    load();
  };

  const approvePayroll = async (id: string) => {
    if (!currentUser) return;
    await HRController.approvePayroll(id, currentUser.id);
    load();
  };

  const exportCSV = () => {
    const headers = ['Employee', 'Base Salary', 'Present', 'Absent', 'Late (min)', 'OT (min)', 'Deduction', 'OT Bonus', 'Net Salary', 'Status'];
    const rows = payroll.map(p => [
      p.fullName, p.monthlySalary, p.presentDays, p.absentDays,
      p.totalLateMinutes, p.totalOvertimeMinutes,
      p.lateDeduction, p.overtimeBonus, p.netSalary, p.status,
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `payroll-${year}-${String(month).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalNet   = payroll.reduce((s, p) => s + p.netSalary, 0);
  const totalBase  = payroll.reduce((s, p) => s + p.monthlySalary, 0);
  const approved   = payroll.filter(p => p.status !== 'draft').length;
  const monthName  = new Date(year, month - 1).toLocaleString('en-US', { month: 'long' });

  const canManage  = currentUser?.role === 'admin' || currentUser?.role === 'hr';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payroll</h1>
          <p className="text-sm text-gray-500 mt-0.5">{monthName} {year}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white">
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{new Date(2000, i).toLocaleString('en-US', { month: 'long' })}</option>
            ))}
          </select>
          <input type="number" value={year} min={2020} max={2099}
            onChange={e => setYear(Number(e.target.value))}
            className="w-24 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
          {canManage && (
            <button onClick={computeAll} disabled={!!computing || loading}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors">
              {computing ? <RefreshCw className="size-4 animate-spin" /> : <TrendingUp className="size-4" />}
              Compute All
            </button>
          )}
          {payroll.length > 0 && (
            <button onClick={exportCSV}
              className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50 transition-colors">
              <Download className="size-4" /> CSV
            </button>
          )}
        </div>
      </div>

      {computing && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          <RefreshCw className="size-4 animate-spin" /> Computing payroll for {computing}…
        </div>
      )}

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}

      {/* Summary cards */}
      {payroll.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Base', value: `${cur(totalBase)}`, icon: DollarSign, color: 'bg-blue-50 text-blue-600' },
            { label: 'Total Net Payroll', value: `${cur(totalNet)}`, icon: TrendingUp, color: 'bg-emerald-50 text-emerald-600' },
            { label: 'Approved', value: `${approved}/${payroll.length}`, icon: CheckCircle, color: 'bg-amber-50 text-amber-600' },
          ].map(card => (
            <div key={card.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{card.label}</p>
                <div className={`size-9 rounded-xl flex items-center justify-center ${card.color}`}>
                  <card.icon className="size-4" />
                </div>
              </div>
              <p className="text-xl font-bold text-gray-900">{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="size-6 text-amber-500 animate-spin" />
          </div>
        ) : payroll.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="size-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
              <DollarSign className="size-7 text-gray-300" />
            </div>
            <p className="font-medium text-gray-900">No payroll computed</p>
            <p className="text-sm text-gray-500 mt-1">Click "Compute All" to generate payroll for {monthName} {year}.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Employee', 'Base', 'Present', 'Absent', 'Late (m)', 'OT (m)', 'Deduction', 'OT Bonus', 'Net Pay', 'Status', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3.5 text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {payroll.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3.5 text-sm font-medium text-gray-900">{p.fullName}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-600">{cur(p.monthlySalary)}</td>
                    <td className="px-4 py-3.5 text-sm text-emerald-600 font-medium">{p.presentDays}</td>
                    <td className="px-4 py-3.5 text-sm text-red-600 font-medium">{p.absentDays}</td>
                    <td className="px-4 py-3.5 text-sm text-amber-600">{p.totalLateMinutes}</td>
                    <td className="px-4 py-3.5 text-sm text-blue-600">{p.totalOvertimeMinutes}</td>
                    <td className="px-4 py-3.5 text-sm text-red-600">-{cur(p.lateDeduction)}</td>
                    <td className="px-4 py-3.5 text-sm text-emerald-600">+{cur(p.overtimeBonus)}</td>
                    <td className="px-4 py-3.5 text-sm font-bold text-gray-900">{cur(p.netSalary)}</td>
                    <td className="px-4 py-3.5">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        p.status === 'paid'     ? 'bg-emerald-100 text-emerald-700' :
                        p.status === 'approved' ? 'bg-blue-100 text-blue-700' :
                                                  'bg-gray-100 text-gray-500'
                      }`}>
                        {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      {canManage && p.status === 'draft' && (
                        <button
                          onClick={() => approvePayroll(p.id)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Approve
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50">
                  <td colSpan={8} className="px-4 py-3 text-sm font-semibold text-gray-700 text-right">Total Net Payroll:</td>
                  <td className="px-4 py-3 text-base font-bold text-gray-900">{cur(totalNet)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
