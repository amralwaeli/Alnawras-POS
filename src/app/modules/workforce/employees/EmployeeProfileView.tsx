import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  ArrowLeft, Edit2, UserX, UserCheck, Phone, Mail, Calendar,
  DollarSign, Clock, Fingerprint, FileText, RefreshCw,
  CheckCircle, XCircle, AlertCircle, Building2, Activity,
} from 'lucide-react';
import { usePOS } from '../../../context/POSContext';
import { WorkforceController } from '../../../controllers/WorkforceController';
import { HRController } from '../../../controllers/HRController';
import { EmployeeWithUser, AttendanceLog, PayrollSummary, LeaveRequest } from '../../../models/types';
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

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt  = (d?: Date | string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const fmtT = (d?: Date) => d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
const cur  = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ROLE_COLORS: Record<string, string> = {
  cashier: 'bg-blue-100 text-blue-700', waiter: 'bg-emerald-100 text-emerald-700',
  kitchen: 'bg-orange-100 text-orange-700', juice: 'bg-yellow-100 text-yellow-700',
  hr: 'bg-pink-100 text-pink-700', accounting: 'bg-indigo-100 text-indigo-700',
  manager: 'bg-violet-100 text-violet-700', supervisor: 'bg-cyan-100 text-cyan-700',
  staff: 'bg-teal-100 text-teal-700',
};

const AVATAR_COLORS = [
  'from-blue-500 to-cyan-600', 'from-emerald-500 to-green-600',
  'from-orange-500 to-amber-600', 'from-pink-500 to-rose-600',
  'from-violet-500 to-purple-600', 'from-indigo-500 to-blue-600',
];

function avatarGrad(id: string) {
  const code = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

type Tab = 'attendance' | 'payroll' | 'leave' | 'biometrics';

// ─────────────────────────────────────────────────────────────────────────────
export function EmployeeProfileView() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const navigate = useNavigate();
  const { currentUser } = usePOS();

  const [employee, setEmployee]     = useState<EmployeeWithUser | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [actionError, setActionError] = useState('');
  const [activeTab, setActiveTab]   = useState<Tab>('attendance');
  const [showEdit, setShowEdit]     = useState(false);
  const [confirmAction, setConfirmAction] = useState<'deactivate' | 'reactivate' | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmEmployee, setConfirmEmployee] = useState<EmployeeWithUser | null>(null);

  // Tab data
  const [attLogs, setAttLogs]       = useState<AttendanceLog[]>([]);
  const [payrolls, setPayrolls]     = useState<PayrollSummary[]>([]);
  const [leaves, setLeaves]         = useState<LeaveRequest[]>([]);
  const [tabLoading, setTabLoading] = useState(false);

  // Action state
  const [acting, setActing]         = useState(false);

  const canEdit = currentUser?.role === 'admin' || currentUser?.role === 'hr';

  // ── Load employee ──
  const loadEmployee = async () => {
    if (!employeeId) return;
    setLoading(true);
    const result = await WorkforceController.getEmployee(employeeId);
    if (result.success) setEmployee(result.data);
    else setError(result.error);
    setLoading(false);
  };

  useEffect(() => { loadEmployee(); }, [employeeId]);

  // ── Load tab data ──
  useEffect(() => {
    if (!employee) return;
    setTabLoading(true);

    const load = async () => {
      if (activeTab === 'attendance') {
        const now = new Date();
        const r = await HRController.getAttendanceLogs({
          employeeId: employee.employeeId,
          month: now.getMonth() + 1,
          year: now.getFullYear(),
        });
        if (r.success) setAttLogs(r.data ?? []);
      } else if (activeTab === 'payroll') {
        const now = new Date();
        const r = await HRController.getPayroll(now.getMonth() + 1, now.getFullYear());
        if (r.success) {
          setPayrolls((r.data ?? []).filter(p => p.employeeId === employee.employeeId));
        }
      } else if (activeTab === 'leave') {
        const r = await WorkforceController.getLeaveRequests({ employeeId: employee.employeeId });
        if (r.success) setLeaves(r.data);
      }
      setTabLoading(false);
    };

    load();
  }, [activeTab, employee]);

  const openConfirm = (action: 'deactivate' | 'reactivate') => {
    if (!employee) return;
    setError('');
    setActionError('');
    setConfirmAction(action);
    setConfirmEmployee(employee);
    setConfirmOpen(true);
  };

  const handleConfirmAction = async () => {
    if (!confirmAction || !confirmEmployee) return;
    setConfirmLoading(true);
    setActionError('');

    const actionFn = confirmAction === 'deactivate'
      ? WorkforceController.deactivateEmployee
      : WorkforceController.reactivateEmployee;

    const result = await actionFn(confirmEmployee.employeeId);
    if (result.success) {
      setConfirmOpen(false);
      loadEmployee();
    } else {
      setActionError(result.error || 'Action failed. Please try again.');
    }

    setConfirmLoading(false);
  };

  const handleDeactivate = async () => {
    openConfirm('deactivate');
  };

  const handleReactivate = async () => {
    openConfirm('reactivate');
  };

  // ─── Loading / Error states ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="size-6 text-amber-500 animate-spin" />
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="p-6">
        <button onClick={() => navigate('/workforce/employees')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-4">
          <ArrowLeft className="size-4" /> Back
        </button>
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error || 'Employee not found.'}
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'attendance', label: 'Attendance', icon: Clock },
    { id: 'payroll',    label: 'Payroll',    icon: DollarSign },
    { id: 'leave',      label: 'Leave',      icon: Calendar },
    { id: 'biometrics', label: 'Biometrics', icon: Fingerprint },
  ];

  return (
    <div className="p-6 space-y-6">

      {/* ── Back ── */}
      <button
        onClick={() => navigate('/workforce/employees')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="size-4" /> All Employees
      </button>

      {/* ── Profile card ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-5">

          {/* Avatar */}
          <div className={`size-16 rounded-2xl bg-gradient-to-br ${avatarGrad(employee.id)} flex items-center justify-center text-white text-xl font-bold shrink-0`}>
            {initials(employee.fullName)}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-start gap-3">
              <div>
                <h1 className="text-xl font-bold text-gray-900">{employee.fullName}</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  {employee.employeeNumber ?? employee.employeeId} · {employee.department}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ROLE_COLORS[employee.role] ?? 'bg-gray-100 text-gray-600'}`}>
                  {employee.role.charAt(0).toUpperCase() + employee.role.slice(1)}
                </span>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                  employee.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {employee.status === 'active' ? 'Active' : 'Inactive'}
                </span>
                {employee.hasFingerprint && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 flex items-center gap-1">
                    <Fingerprint className="size-3" /> Enrolled
                  </span>
                )}
              </div>
            </div>

            {/* Contact + Employment details */}
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              {employee.email && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Mail className="size-4 text-gray-400 shrink-0" />
                  <span className="truncate">{employee.email}</span>
                </div>
              )}
              {employee.phone && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="size-4 text-gray-400 shrink-0" />
                  <span>{employee.phone}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Calendar className="size-4 text-gray-400 shrink-0" />
                <span>Hired {fmt(employee.hireDate)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <DollarSign className="size-4 text-gray-400 shrink-0" />
                <span>{cur(employee.monthlySalary)}/mo</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock className="size-4 text-gray-400 shrink-0" />
                <span>{employee.shiftStart} – {employee.shiftEnd}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Building2 className="size-4 text-gray-400 shrink-0" />
                <span>{employee.department}</span>
              </div>
            </div>

            {employee.notes && (
              <p className="mt-3 text-sm text-gray-500 italic">"{employee.notes}"</p>
            )}
          </div>

          {/* Actions */}
          {canEdit && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowEdit(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Edit2 className="size-4" /> Edit
              </button>
              {employee.status === 'active' ? (
                <button
                  onClick={handleDeactivate}
                  disabled={acting}
                  className="flex items-center gap-2 px-3 py-2 text-sm border border-red-200 rounded-xl text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <UserX className="size-4" /> Deactivate
                </button>
              ) : (
                <button
                  onClick={handleReactivate}
                  disabled={acting}
                  className="flex items-center gap-2 px-3 py-2 text-sm border border-emerald-200 rounded-xl text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                >
                  <UserCheck className="size-4" /> Reactivate
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 flex overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'border-b-2 border-amber-500 text-amber-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="size-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tabLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="size-5 text-amber-500 animate-spin" />
            </div>
          ) : (
            <>
              {/* ── Attendance Tab ── */}
              {activeTab === 'attendance' && (
                <AttendanceTab logs={attLogs} />
              )}

              {/* ── Payroll Tab ── */}
              {activeTab === 'payroll' && (
                <PayrollTab payrolls={payrolls} />
              )}

              {/* ── Leave Tab ── */}
              {activeTab === 'leave' && (
                <LeaveTab leaves={leaves} employee={employee} onRefresh={() => {
                  const r = WorkforceController.getLeaveRequests({ employeeId: employee.employeeId });
                  r.then(res => { if (res.success) setLeaves(res.data); });
                }} />
              )}

              {/* ── Biometrics Tab ── */}
              {activeTab === 'biometrics' && (
                <BiometricsTab employee={employee} onRefresh={loadEmployee} />
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Edit modal ── */}
      {showEdit && (
        <EmployeeFormModal
          initial={employee}
          branchId={employee.branchId}
          onSave={() => { setShowEdit(false); loadEmployee(); }}
          onClose={() => setShowEdit(false)}
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

// ─── Attendance Tab ────────────────────────────────────────────────────────
function AttendanceTab({ logs }: { logs: AttendanceLog[] }) {
  if (logs.length === 0) {
    return <EmptyState icon={Clock} message="No attendance records this month." />;
  }

  const present = logs.filter(l => l.checkInTime).length;
  const late    = logs.filter(l => l.lateMinutes > 0).length;
  const totalOT = logs.reduce((s, l) => s + l.overtimeMinutes, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Days Present',   value: present,           color: 'text-emerald-600' },
          { label: 'Late Arrivals',  value: late,              color: 'text-amber-600' },
          { label: 'Overtime (min)', value: totalOT,           color: 'text-blue-600' },
        ].map(s => (
          <div key={s.label} className="bg-gray-50 rounded-xl p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              {['Date', 'Check In', 'Check Out', 'Late (min)', 'OT (min)', 'Status'].map(h => (
                <th key={h} className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {logs.map(log => (
              <tr key={log.id}>
                <td className="px-3 py-3 text-sm text-gray-900">{log.logDate}</td>
                <td className="px-3 py-3 text-sm text-gray-700">{fmtT(log.checkInTime)}</td>
                <td className="px-3 py-3 text-sm text-gray-700">{fmtT(log.checkOutTime)}</td>
                <td className="px-3 py-3 text-sm">
                  {log.lateMinutes > 0 ? <span className="text-amber-600 font-medium">{log.lateMinutes}</span> : <span className="text-gray-400">0</span>}
                </td>
                <td className="px-3 py-3 text-sm">
                  {log.overtimeMinutes > 0 ? <span className="text-blue-600 font-medium">{log.overtimeMinutes}</span> : <span className="text-gray-400">0</span>}
                </td>
                <td className="px-3 py-3">
                  <StatusBadge status={log.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Payroll Tab ──────────────────────────────────────────────────────────
function PayrollTab({ payrolls }: { payrolls: PayrollSummary[] }) {
  if (payrolls.length === 0) {
    return <EmptyState icon={DollarSign} message="No payroll records found." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100">
            {['Period', 'Base Salary', 'Present Days', 'Late Deduction', 'OT Bonus', 'Net Pay', 'Status'].map(h => (
              <th key={h} className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {payrolls.map(p => (
            <tr key={p.id}>
              <td className="px-3 py-3 text-sm text-gray-900">{p.month}/{p.year}</td>
              <td className="px-3 py-3 text-sm text-gray-700">{cur(p.monthlySalary)}</td>
              <td className="px-3 py-3 text-sm text-gray-700">{p.presentDays}/{p.workingDays}</td>
              <td className="px-3 py-3 text-sm text-red-600">-{cur(p.lateDeduction)}</td>
              <td className="px-3 py-3 text-sm text-emerald-600">+{cur(p.overtimeBonus)}</td>
              <td className="px-3 py-3 text-sm font-bold text-gray-900">{cur(p.netSalary)}</td>
              <td className="px-3 py-3">
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                  p.status === 'paid'     ? 'bg-emerald-100 text-emerald-700' :
                  p.status === 'approved' ? 'bg-blue-100 text-blue-700' :
                                            'bg-gray-100 text-gray-500'
                }`}>
                  {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Leave Tab ────────────────────────────────────────────────────────────
function LeaveTab({ leaves, employee, onRefresh }: {
  leaves: LeaveRequest[];
  employee: EmployeeWithUser;
  onRefresh: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState({ leaveType: 'annual' as LeaveRequest['leaveType'], startDate: '', endDate: '', reason: '' });
  const { currentUser } = usePOS();

  const canSubmit = currentUser?.role === 'admin' || currentUser?.role === 'hr' ||
                    currentUser?.role === 'manager';

  const handleSubmit = async () => {
    if (!form.startDate || !form.endDate) return;
    setSubmitting(true);
    await WorkforceController.submitLeaveRequest({
      employeeId: employee.employeeId,
      leaveType: form.leaveType,
      startDate: form.startDate,
      endDate: form.endDate,
      reason: form.reason,
      branchId: employee.branchId,
    });
    setSubmitting(false);
    setShowForm(false);
    onRefresh();
  };

  return (
    <div className="space-y-4">
      {canSubmit && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowForm(s => !s)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors"
          >
            + Request Leave
          </button>
        </div>
      )}

      {showForm && (
        <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-200">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Leave Type</label>
              <select value={form.leaveType} onChange={e => setForm(f => ({ ...f, leaveType: e.target.value as any }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500">
                {['annual','sick','emergency','unpaid','other'].map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Reason</label>
              <input type="text" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Optional reason"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Start Date</label>
              <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">End Date</label>
              <input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={handleSubmit} disabled={submitting}
              className="px-4 py-1.5 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50">
              Submit
            </button>
          </div>
        </div>
      )}

      {leaves.length === 0 ? (
        <EmptyState icon={Calendar} message="No leave requests." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {['Type', 'From', 'To', 'Days', 'Status', 'Reviewed By'].map(h => (
                  <th key={h} className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {leaves.map(l => (
                <tr key={l.id}>
                  <td className="px-3 py-3 text-sm text-gray-900 capitalize">{l.leaveType}</td>
                  <td className="px-3 py-3 text-sm text-gray-700">{l.startDate}</td>
                  <td className="px-3 py-3 text-sm text-gray-700">{l.endDate}</td>
                  <td className="px-3 py-3 text-sm text-gray-700">{l.daysCount}</td>
                  <td className="px-3 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      l.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                      l.status === 'rejected' ? 'bg-red-100 text-red-700' :
                                                'bg-amber-100 text-amber-700'
                    }`}>
                      {l.status.charAt(0).toUpperCase() + l.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-500">{l.reviewedBy ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Biometrics Tab ────────────────────────────────────────────────────────
function BiometricsTab({ employee, onRefresh }: { employee: EmployeeWithUser; onRefresh: () => void }) {
  const { currentUser } = usePOS();
  const [deleting, setDeleting] = useState(false);
  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'hr';

  const handleDelete = async () => {
    if (!confirm('Remove enrolled fingerprint?')) return;
    setDeleting(true);
    await HRController.deleteFingerprint(employee.employeeId);
    setDeleting(false);
    onRefresh();
  };

  return (
    <div className="flex flex-col items-center justify-center py-8 gap-6">
      <div className={`size-20 rounded-2xl flex items-center justify-center ${
        employee.hasFingerprint ? 'bg-blue-50' : 'bg-gray-50'
      }`}>
        <Fingerprint className={`size-10 ${employee.hasFingerprint ? 'text-blue-500' : 'text-gray-300'}`} />
      </div>

      <div className="text-center">
        <p className="font-semibold text-gray-900">
          {employee.hasFingerprint ? 'Fingerprint Enrolled' : 'No Fingerprint Enrolled'}
        </p>
        <p className="text-sm text-gray-500 mt-1">
          {employee.hasFingerprint
            ? 'This employee can use fingerprint to clock in and out.'
            : 'Enroll a fingerprint to enable biometric clock in/out.'}
        </p>
      </div>

      {canManage && (
        <div className="flex gap-3">
          {employee.hasFingerprint ? (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-red-200 text-red-600 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <XCircle className="size-4" /> Remove Fingerprint
            </button>
          ) : null}
          <a
            href="/fingerprint-checkin"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 text-sm bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors"
          >
            <Fingerprint className="size-4" />
            {employee.hasFingerprint ? 'Re-enroll' : 'Enroll Now'} (Kiosk)
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Shared helpers ────────────────────────────────────────────────────────
function EmptyState({ icon: Icon, message }: { icon: any; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="size-12 rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
        <Icon className="size-6 text-gray-300" />
      </div>
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    'on-time':    'bg-emerald-100 text-emerald-700',
    'present':    'bg-emerald-100 text-emerald-700',
    'late':       'bg-amber-100 text-amber-700',
    'early-leave':'bg-orange-100 text-orange-700',
    'absent':     'bg-red-100 text-red-700',
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())}
    </span>
  );
}
