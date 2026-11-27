import { useState, useEffect, useCallback } from 'react';
import { CalendarOff, CheckCircle, XCircle, Clock, RefreshCw, Plus, X } from 'lucide-react';
import { usePOS } from '../../../context/POSContext';
import { WorkforceController } from '../../../controllers/WorkforceController';
import { LeaveRequest, EmployeeWithUser, ROLE_PERMISSIONS } from '../../../models/types';
import { friendlyError } from '../../../../lib/errors';
import { localDateStr } from '../../../../lib/date';
import { DAYS_OFF_PER_MONTH } from '../../../../lib/daysOff';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: 'Annual', sick: 'Sick', unpaid: 'Unpaid',
  emergency: 'Emergency', other: 'Other', day_off: 'Day off',
};

/** Every date from `from` to `to` inclusive ("YYYY-MM-DD"); just `from` when `to` is empty or earlier. */
function datesBetween(from: string, to: string): string[] {
  const [y, m, d] = from.split('-').map(Number);
  const cur = new Date(y, m - 1, d);
  const out: string[] = [];
  do {
    out.push(localDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  } while (to && localDateStr(cur) <= to && out.length < 31);
  return out;
}

const STATUS_BADGE: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

export function LeaveManagementView() {
  const { currentUser } = usePOS();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const branchId = currentUser?.branchId ?? 'branch-1';

  const canApprove = currentUser
    ? ['admin', 'hr', 'manager'].includes(currentUser.role)
    : false;
  const canRecord = currentUser ? !!ROLE_PERMISSIONS[currentUser.role]?.canManageLeave : false;

  // Days-off panel: approved day_off rows for the chosen month, per active employee.
  const [month, setMonth] = useState(() => localDateStr().slice(0, 7)); // "YYYY-MM"
  const [employees, setEmployees] = useState<EmployeeWithUser[]>([]);
  const [monthDaysOff, setMonthDaysOff] = useState<LeaveRequest[]>([]);
  const [showRecord, setShowRecord] = useState(false);

  const loadDaysOff = useCallback(async () => {
    const [y, m] = month.split('-').map(Number);
    if (!y || !m) return;
    const [emps, leave] = await Promise.all([
      WorkforceController.getEmployees({ status: 'active' }),
      WorkforceController.getLeaveRequests(branchId, { status: 'approved', month: m, year: y }),
    ]);
    if (emps.success) setEmployees(emps.data);
    if (leave.success) setMonthDaysOff(leave.data.filter(r => r.leaveType === 'day_off'));
    else setError(friendlyError(leave.error));
  }, [branchId, month]);

  useEffect(() => { loadDaysOff(); }, [loadDaysOff]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await WorkforceController.getLeaveRequests(branchId, {
      status: statusFilter === 'all' ? undefined : statusFilter,
    });
    if (result.success) setRequests(result.data);
    else setError(friendlyError(result.error));
    setLoading(false);
  }, [branchId, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleReview = async (id: string, status: 'approved' | 'rejected') => {
    if (!currentUser) return;
    setActionLoading(id + status);
    const result = await WorkforceController.reviewLeaveRequest(id, status, currentUser.name);
    if (result.success) {
      setRequests(prev =>
        prev.map(r => r.id === id
          ? { ...r, status, reviewedBy: currentUser.name, reviewedAt: new Date() }
          : r
        )
      );
    } else {
      setError(friendlyError(result.error));
    }
    setActionLoading(null);
  };

  const pending  = requests.filter(r => r.status === 'pending').length;
  const approved = requests.filter(r => r.status === 'approved').length;
  const rejected = requests.filter(r => r.status === 'rejected').length;

  const tabs: { key: StatusFilter; label: string }[] = [
    { key: 'all',      label: `All (${requests.length})` },
    { key: 'pending',  label: `Pending (${pending})` },
    { key: 'approved', label: `Approved (${approved})` },
    { key: 'rejected', label: `Rejected (${rejected})` },
  ];

  const displayed = statusFilter === 'all'
    ? requests
    : requests.filter(r => r.status === statusFilter);

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Leave Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Review and manage employee leave requests</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canRecord && (
            <button
              onClick={() => setShowRecord(true)}
              className="flex items-center gap-2 px-4 py-2 min-h-11 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="size-4" />
              Record day off
            </button>
          )}
          <button
            onClick={() => { load(); loadDaysOff(); }}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 min-h-11 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Days off this month */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-200">
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900">Days off this month</h2>
            <p className="text-xs text-gray-500">{DAYS_OFF_PER_MONTH} per employee; extra days are deducted from payroll</p>
          </div>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            aria-label="Month"
            className="min-h-11 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
          />
        </div>
        {employees.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-400 text-center">No active employees</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {employees.map(emp => {
              const used = monthDaysOff.filter(r => r.employeeId === emp.employeeId).length;
              const extra = used - DAYS_OFF_PER_MONTH;
              const tone = extra > 0 ? 'text-red-600' : used === DAYS_OFF_PER_MONTH ? 'text-amber-600' : 'text-gray-600';
              return (
                <li key={emp.employeeId} className="flex items-center justify-between gap-3 px-4 py-2.5 min-h-11 text-sm">
                  <span dir="auto" className="font-medium text-gray-900 min-w-0 break-words">{emp.fullName}</span>
                  <span className={`shrink-0 text-right font-medium ${tone}`}>
                    {used} of {DAYS_OFF_PER_MONTH} used
                    {extra > 0 && <span className="block text-xs">+{extra} extra (deducted)</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showRecord && currentUser && (
        <RecordDayOffModal
          employees={employees}
          branchId={branchId}
          recordedBy={currentUser.name}
          onClose={() => setShowRecord(false)}
          onSaved={() => { setShowRecord(false); load(); loadDaysOff(); }}
        />
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 min-w-0">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
            <div className="size-10 shrink-0 rounded-lg bg-amber-50 flex items-center justify-center">
              <Clock className="size-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{pending}</p>
              <p className="text-xs text-gray-500 uppercase tracking-wide truncate">Pending</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 min-w-0">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
            <div className="size-10 shrink-0 rounded-lg bg-green-50 flex items-center justify-center">
              <CheckCircle className="size-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{approved}</p>
              <p className="text-xs text-gray-500 uppercase tracking-wide truncate">Approved</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 min-w-0">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
            <div className="size-10 shrink-0 rounded-lg bg-red-50 flex items-center justify-center">
              <XCircle className="size-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{rejected}</p>
              <p className="text-xs text-gray-500 uppercase tracking-wide truncate">Rejected</p>
            </div>
          </div>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200 overflow-x-auto overscroll-x-contain no-scrollbar">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`shrink-0 whitespace-nowrap px-4 sm:px-5 py-3 min-h-11 text-sm font-medium transition-colors border-b-2 ${
                statusFilter === tab.key
                  ? 'border-amber-500 text-amber-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="m-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <CalendarOff className="size-10 mb-3" />
            <p className="font-medium">No leave requests found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Employee</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">From</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">To</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Days</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Reason</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  {canApprove && (
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayed.map(req => (
                  <tr key={req.id} className="hover:bg-gray-50 transition-colors">
                    <td dir="auto" className="px-4 py-3 font-medium text-gray-900 max-w-[14rem] break-words">
                      {req.employeeName ?? req.employeeId}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {LEAVE_TYPE_LABELS[req.leaveType] ?? req.leaveType}
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{req.startDate}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{req.endDate}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {req.daysCount}
                    </td>
                    <td dir="auto" className="px-4 py-3 text-gray-500 max-w-xs truncate">
                      {req.reason ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[req.status]}`}>
                        {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                      </span>
                    </td>
                    {canApprove && (
                      <td className="px-4 py-3 text-right">
                        {req.status === 'pending' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleReview(req.id, 'approved')}
                              disabled={actionLoading === req.id + 'approved'}
                              className="px-3 py-1 pointer-coarse:py-3 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                            >
                              {actionLoading === req.id + 'approved' ? '…' : 'Approve'}
                            </button>
                            <button
                              onClick={() => handleReview(req.id, 'rejected')}
                              disabled={actionLoading === req.id + 'rejected'}
                              className="px-3 py-1 pointer-coarse:py-3 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                            >
                              {actionLoading === req.id + 'rejected' ? '…' : 'Reject'}
                            </button>
                          </div>
                        ) : (
                          <span dir="auto" className="text-xs text-gray-400">
                            {req.reviewedBy ? `by ${req.reviewedBy}` : '—'}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function RecordDayOffModal({ employees, branchId, recordedBy, onClose, onSaved }: {
  employees: EmployeeWithUser[];
  branchId: string;
  recordedBy: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [employeeId, setEmployeeId] = useState('');
  const [from, setFrom] = useState(() => localDateStr());
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!employeeId || !from) { setErr('Choose an employee and a date.'); return; }
    if (to && to < from) { setErr('"To" must be on or after the first date.'); return; }
    setSaving(true);
    setErr(null);
    const r = await WorkforceController.recordDaysOff({
      employeeId, dates: datesBetween(from, to), branchId, recordedBy, reason: note.trim() || undefined,
    });
    setSaving(false);
    if (!r.success) { setErr(friendlyError(r.error)); return; }
    if (r.data === 0) { setErr('Those days are already recorded.'); return; }
    onSaved();
  };

  const field = 'mt-1 w-full min-h-11 px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white';
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="record-day-off-title">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 sm:p-6 space-y-4 max-h-[90dvh] overflow-y-auto overscroll-contain">
        <div className="flex items-center justify-between gap-3">
          <h2 id="record-day-off-title" className="text-lg font-bold text-gray-900">Record day off</h2>
          <button onClick={onClose} aria-label="Close" className="shrink-0 flex items-center justify-center size-11 -m-2 rounded-lg hover:bg-gray-100"><X className="size-5 text-gray-400" /></button>
        </div>

        <label className="block text-sm">
          <span className="text-gray-600">Employee</span>
          <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className={field}>
            <option value="">Select employee…</option>
            {employees.map(e => <option key={e.employeeId} value={e.employeeId}>{e.fullName}</option>)}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-gray-600">Date</span>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={field} />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">To (optional)</span>
            <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className={field} />
          </label>
        </div>

        <label className="block text-sm">
          <span className="text-gray-600">Note (optional)</span>
          <input type="text" dir="auto" value={note} onChange={e => setNote(e.target.value)} className={field} />
        </label>

        {err && <p className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{err}</p>}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 min-h-11 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 min-h-11 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
