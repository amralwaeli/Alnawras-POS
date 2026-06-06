import { useState, useEffect, useCallback } from 'react';
import { CalendarOff, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react';
import { usePOS } from '../../../context/POSContext';
import { WorkforceController } from '../../../controllers/WorkforceController';
import { LeaveRequest, ROLE_PERMISSIONS } from '../../../models/types';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: 'Annual', sick: 'Sick', unpaid: 'Unpaid',
  emergency: 'Emergency', other: 'Other',
};

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await WorkforceController.getLeaveRequests(branchId, {
      status: statusFilter === 'all' ? undefined : statusFilter,
    });
    if (result.success) setRequests(result.data);
    else setError(result.error);
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
      setError(result.error);
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Review and manage employee leave requests</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <Clock className="size-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{pending}</p>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Pending</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-green-50 flex items-center justify-center">
              <CheckCircle className="size-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{approved}</p>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Approved</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-red-50 flex items-center justify-center">
              <XCircle className="size-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{rejected}</p>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Rejected</p>
            </div>
          </div>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
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
            <table className="w-full text-sm">
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
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {req.employeeName ?? req.employeeId}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {LEAVE_TYPE_LABELS[req.leaveType] ?? req.leaveType}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{req.startDate}</td>
                    <td className="px-4 py-3 text-gray-700">{req.endDate}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {req.daysCount}
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs truncate">
                      {req.reason ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[req.status]}`}>
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
                              className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                            >
                              {actionLoading === req.id + 'approved' ? '…' : 'Approve'}
                            </button>
                            <button
                              onClick={() => handleReview(req.id, 'rejected')}
                              disabled={actionLoading === req.id + 'rejected'}
                              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                            >
                              {actionLoading === req.id + 'rejected' ? '…' : 'Reject'}
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">
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
