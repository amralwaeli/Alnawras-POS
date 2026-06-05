import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import {
  Users, UserCheck, UserX, Fingerprint, Plus, Search,
  Edit2, Trash2, RefreshCw, ChevronRight, Filter,
} from 'lucide-react';
import { usePOS } from '../../../context/POSContext';
import { WorkforceController } from '../../../controllers/WorkforceController';
import { EmployeeWithUser, EmployeeFilters } from '../../../models/types';
import { EmployeeFormModal } from './EmployeeFormModal';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from '../../../components/ui/alert-dialog';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ROLE_LABELS: Record<string, string> = {
  cashier: 'Cashier', waiter: 'Waiter', kitchen: 'Kitchen', juice: 'Juice Bar',
  hr: 'HR', accounting: 'Accountant', manager: 'Manager',
  supervisor: 'Supervisor', staff: 'Staff',
};

const ROLE_COLORS: Record<string, string> = {
  cashier:    'bg-blue-100 text-blue-700',
  waiter:     'bg-emerald-100 text-emerald-700',
  kitchen:    'bg-orange-100 text-orange-700',
  juice:      'bg-yellow-100 text-yellow-700',
  hr:         'bg-pink-100 text-pink-700',
  accounting: 'bg-indigo-100 text-indigo-700',
  manager:    'bg-violet-100 text-violet-700',
  supervisor: 'bg-cyan-100 text-cyan-700',
  staff:      'bg-teal-100 text-teal-700',
};

const AVATAR_COLORS = [
  'from-blue-500 to-cyan-600',
  'from-emerald-500 to-green-600',
  'from-orange-500 to-amber-600',
  'from-pink-500 to-rose-600',
  'from-violet-500 to-purple-600',
  'from-indigo-500 to-blue-600',
  'from-teal-500 to-cyan-600',
  'from-yellow-500 to-amber-500',
];

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

function avatarColor(id: string) {
  const code = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

function StatusDot({ status }: { status: EmployeeWithUser['todayStatus'] }) {
  if (status === 'present')        return <span className="inline-block size-2 rounded-full bg-emerald-500" title="Present" />;
  if (status === 'not-checked-in') return <span className="inline-block size-2 rounded-full bg-gray-300" title="Not Checked In" />;
  return null;
}

// ─── Main component ───────────────────────────────────────────────────────────
export function EmployeesView() {
  const { currentUser } = usePOS();
  const navigate = useNavigate();

  const [employees, setEmployees]   = useState<EmployeeWithUser[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [showForm, setShowForm]     = useState(false);
  const [editTarget, setEditTarget] = useState<EmployeeWithUser | undefined>();
  const [deleting, setDeleting]     = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [confirmAction, setConfirmAction] = useState<'deactivate' | 'reactivate' | null>(null);
  const [confirmEmployee, setConfirmEmployee] = useState<EmployeeWithUser | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const [filters, setFilters] = useState<EmployeeFilters>({ status: 'active' });
  const [search, setSearch]   = useState('');

  const branchId = currentUser?.branchId ?? 'branch-1';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const result = await WorkforceController.getEmployees({
      ...filters,
      search: search.trim() || undefined,
    });
    if (result.success) setEmployees(result.data);
    else setError(result.error);
    setLoading(false);
  }, [filters, search]);

  useEffect(() => { load(); }, [load]);

  const handleSaved = (emp: any) => {
    setShowForm(false);
    setEditTarget(undefined);
    load();
  };

  const openConfirm = (action: 'deactivate' | 'reactivate', emp: EmployeeWithUser) => {
    setActionError('');
    setConfirmAction(action);
    setConfirmEmployee(emp);
    setConfirmOpen(true);
  };

  const handleConfirmAction = async () => {
    if (!confirmAction || !confirmEmployee) return;
    setConfirmLoading(true);
    setActionError('');
    setDeleting(confirmEmployee.employeeId);

    const employeeId = confirmEmployee.employeeId;
    const actionFn = confirmAction === 'deactivate'
      ? WorkforceController.deactivateEmployee
      : WorkforceController.reactivateEmployee;

    const result = await actionFn(employeeId);
    if (result.success) {
      setConfirmOpen(false);
      load();
    } else {
      setActionError(result.error || 'Action failed. Please try again.');
    }

    setConfirmLoading(false);
    setDeleting(null);
  };

  const handleDeactivate = (emp: EmployeeWithUser) => {
    openConfirm('deactivate', emp);
  };

  const handleReactivate = (emp: EmployeeWithUser) => {
    openConfirm('reactivate', emp);
  };

  // ── Stats ──
  const total    = employees.length;
  const active   = employees.filter(e => e.status === 'active').length;
  const inactive = employees.filter(e => e.status === 'inactive').length;
  const present  = employees.filter(e => e.todayStatus === 'present').length;
  const withFP   = employees.filter(e => e.hasFingerprint).length;

  const canEdit   = currentUser?.role === 'admin' || currentUser?.role === 'hr';
  const showInactive = filters.status === 'inactive';

  return (
    <div className="p-6 space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {active} active · {inactive} inactive · {present} present today
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setEditTarget(undefined); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white text-sm font-medium rounded-xl hover:bg-amber-600 transition-colors shadow-sm"
          >
            <Plus className="size-4" />
            Add Employee
          </button>
        )}
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Employees', value: total,    icon: Users,        color: 'bg-blue-50 text-blue-600' },
          { label: 'Present Today',   value: present,  icon: UserCheck,    color: 'bg-emerald-50 text-emerald-600' },
          { label: 'Inactive',        value: inactive, icon: UserX,        color: 'bg-red-50 text-red-600' },
          { label: 'Fingerprint',     value: `${withFP}/${total}`, icon: Fingerprint, color: 'bg-amber-50 text-amber-600' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
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

      {/* ── Filters ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, ID or email…"
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <select
            value={filters.role ?? ''}
            onChange={e => setFilters(f => ({ ...f, role: e.target.value || undefined }))}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
          >
            <option value="">All Roles</option>
            {Object.entries(ROLE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <select
            value={filters.status ?? 'active'}
            onChange={e => setFilters(f => ({ ...f, status: e.target.value as any }))}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {actionError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {/* ── Table ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="size-6 text-amber-500 animate-spin" />
          </div>
        ) : employees.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="size-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
              <Users className="size-7 text-gray-300" />
            </div>
            <p className="font-medium text-gray-900">No employees found</p>
            <p className="text-sm text-gray-500 mt-1">
              {search ? 'Try a different search term.' : 'Add your first employee to get started.'}
            </p>
            {canEdit && !search && (
              <button
                onClick={() => setShowForm(true)}
                className="mt-4 flex items-center gap-2 px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-xl hover:bg-amber-600 transition-colors"
              >
                <Plus className="size-4" />
                Add Employee
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-3.5 text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                  <th className="text-left px-4 py-3.5 text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Department</th>
                  <th className="text-left px-4 py-3.5 text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="text-left px-4 py-3.5 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Today</th>
                  <th className="text-left px-4 py-3.5 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Fingerprint</th>
                  <th className="text-left px-4 py-3.5 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {employees.map(emp => (
                  <tr
                    key={emp.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/workforce/employees/${emp.employeeId}`)}
                  >
                    {/* Employee */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`size-9 rounded-full bg-gradient-to-br ${avatarColor(emp.id)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                          {initials(emp.fullName)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{emp.fullName}</p>
                          <p className="text-xs text-gray-400">{emp.employeeNumber ?? emp.employeeId}</p>
                        </div>
                      </div>
                    </td>

                    {/* Department */}
                    <td className="px-4 py-4 hidden lg:table-cell">
                      <span className="text-sm text-gray-600">{emp.department ?? '—'}</span>
                    </td>

                    {/* Role */}
                    <td className="px-4 py-4">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${ROLE_COLORS[emp.role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {ROLE_LABELS[emp.role] ?? emp.role}
                      </span>
                    </td>

                    {/* Today status */}
                    <td className="px-4 py-4 hidden md:table-cell">
                      <div className="flex items-center gap-1.5">
                        <StatusDot status={emp.todayStatus} />
                        <span className="text-xs text-gray-500">
                          {emp.todayCheckIn
                            ? new Date(emp.todayCheckIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : '—'}
                        </span>
                      </div>
                    </td>

                    {/* Fingerprint */}
                    <td className="px-4 py-4 hidden md:table-cell">
                      {emp.hasFingerprint
                        ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><Fingerprint className="size-3.5" /> Enrolled</span>
                        : <span className="text-xs text-gray-400">—</span>
                      }
                    </td>

                    {/* Status */}
                    <td className="px-4 py-4">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                        emp.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {emp.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => navigate(`/workforce/employees/${emp.employeeId}`)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                          title="View Profile"
                        >
                          <ChevronRight className="size-4" />
                        </button>
                        {canEdit && (
                          <>
                            <button
                              onClick={() => { setEditTarget(emp); setShowForm(true); }}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              title="Edit"
                            >
                              <Edit2 className="size-4" />
                            </button>
                            {emp.status === 'active' ? (
                              <button
                                onClick={() => handleDeactivate(emp)}
                                disabled={deleting === emp.employeeId}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                                title="Deactivate"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleReactivate(emp)}
                                disabled={deleting === emp.employeeId}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-40 text-xs font-medium px-2"
                                title="Reactivate"
                              >
                                Activate
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showForm && (
        <EmployeeFormModal
          initial={editTarget}
          branchId={branchId}
          onSave={handleSaved}
          onClose={() => { setShowForm(false); setEditTarget(undefined); }}
        />
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === 'deactivate' ? 'Deactivate employee' : 'Reactivate employee'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmEmployee
                ? confirmAction === 'deactivate'
                  ? `This will disable ${confirmEmployee.fullName}'s POS login and mark them inactive.`
                  : `This will restore ${confirmEmployee.fullName}'s POS login and mark them active.`
                : 'Confirm this action to proceed.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {actionError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4">
              {actionError}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmLoading}>Cancel</AlertDialogCancel>
            <button
              type="button"
              onClick={handleConfirmAction}
              disabled={confirmLoading}
              className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {confirmLoading ? 'Processing...' : confirmAction === 'deactivate' ? 'Deactivate' : 'Reactivate'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
