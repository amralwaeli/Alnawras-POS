import { useState, useEffect, useCallback } from 'react';
import { CalendarOff, RefreshCw, CheckCircle, XCircle, Clock, Filter } from 'lucide-react';
import { usePOS } from '../../../context/POSContext';
import { WorkforceController } from '../../../controllers/WorkforceController';
import { LeaveRequest } from '../../../models/types';

const STATUS_COLORS: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
};

const TYPE_LABELS: Record<string, string> = {
  annual: 'Annual', sick: 'Sick', emergency: 'Emergency', unpaid: 'Unpaid', other: 'Other',
};

export function LeaveManagementView() {
  const { currentUser } = usePOS();
  const [leaves, setLeaves]       = useState<LeaveRequest[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [statusFilter, setStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [acting, setActing]       = useState<string | null>(null);

  const canApprove = currentUser?.role === 'admin' || currentUser?.role === 'hr' || currentUser?.role === 'manager';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const r = await WorkforceController.getLeaveRequests({
      status: statusFilter === 'all' ? undefined : statusFilter,
    });
    if (r.success) setLeaves(r.data);
    else setError(r.error);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const review = async (id: string, status: 'approved' | 'rejected') => {
    if (!currentUser) return;
    setActing(id);
    await WorkforceController.reviewLeaveRequest(id, status, currentUser.name);
    setActing(null);
    load();
  };

  const pending  = leaves.filter(l => l.status === 'pending').length;
  const approved = leaves.filter(l => l.status === 'approved').length;
  const rejected = leaves.filter(l => l.status === 'rejected').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {pending} pending · {approved} approved · {rejected} rejected
          </p>
        </div>
        <button onClick={load} className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pending',  value: pending,  icon: Clock,         color: 'bg-amber-50 text-amber-600' },
          { label: 'Approved', value: approved, icon: CheckCircle,   color: 'bg-emerald-50 text-emerald-600' },
          { label: 'Rejected', value: rejected, icon: XCircle,       color: 'bg-red-50 text-red-600' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{card.label}</p>
              <div className={`size-9 rounded-xl flex items-center justify-center ${card.color}`}>
                <card.icon className="size-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
        <Filter className="size-4 text-gray-400 shrink-0" />
        {(['all', 'pending', 'approved', 'rejected'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === s
                ? 'bg-amber-500 text-white'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="size-6 text-amber-500 animate-spin" />
          </div>
        ) : leaves.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="size-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
              <CalendarOff className="size-7 text-gray-300" />
            </div>
            <p className="font-medium text-gray-900">No leave requests</p>
            <p className="text-sm text-gray-500 mt-1">
              {statusFilter !== 'all' ? `No ${statusFilter} requests.` : 'Leave requests will appear here.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Employee', 'Type', 'From', 'To', 'Days', 'Reason', 'Status', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3.5 text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {leaves.map(l => (
                  <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3.5 text-sm font-medium text-gray-900">
                      {l.employeeName ?? l.employeeId}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-700">
                      {TYPE_LABELS[l.leaveType] ?? l.leaveType}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-700">{l.startDate}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-700">{l.endDate}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-700">{l.daysCount}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-500 max-w-[160px] truncate">
                      {l.reason ?? '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[l.status]}`}>
                        {l.status.charAt(0).toUpperCase() + l.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      {canApprove && l.status === 'pending' && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => review(l.id, 'approved')}
                            disabled={acting === l.id}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors disabled:opacity-50"
                          >
                            <CheckCircle className="size-3.5" /> Approve
                          </button>
                          <button
                            onClick={() => review(l.id, 'rejected')}
                            disabled={acting === l.id}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50"
                          >
                            <XCircle className="size-3.5" /> Reject
                          </button>
                        </div>
                      )}
                      {l.status !== 'pending' && (
                        <span className="text-xs text-gray-400">{l.reviewedBy ?? '—'}</span>
                      )}
                    </td>
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
