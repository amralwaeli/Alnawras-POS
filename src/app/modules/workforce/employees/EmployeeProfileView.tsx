import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  ArrowLeft, Edit2, UserX, UserCheck, Phone, Mail, Calendar,
  DollarSign, Clock, Fingerprint, FileText, RefreshCw,
  CheckCircle, XCircle, AlertCircle, Building2, Activity, TrendingUp,
} from 'lucide-react';
import { EmployeePerformanceTab } from '../performance/EmployeePerformanceTab';
import { usePOS } from '../../../context/POSContext';
import { WorkforceController } from '../../../controllers/WorkforceController';
import { HRController } from '../../../controllers/HRController';
import { EmployeeWithUser, AttendanceLog, PayrollSummary } from '../../../models/types';
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
import { friendlyError } from '../../../../lib/errors';
import { currentPayPeriod } from '../../../../lib/payPeriod';
import { CURRENCY } from '../../../../lib/currency';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt  = (d?: Date | string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const fmtT = (d?: Date) => d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
const cur  = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ROLE_COLORS: Record<string, string> = {
  cashier: 'bg-blue-100 text-blue-700', waiter: 'bg-emerald-100 text-emerald-700',
  kitchen: 'bg-orange-100 text-orange-700', juice: 'bg-yellow-100 text-yellow-700', shawarma: 'bg-amber-100 text-amber-800',
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

type Tab = 'attendance' | 'payroll' | 'biometrics' | 'performance';

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
  const [tabLoading, setTabLoading] = useState(false);

  // Salary advances for the current pay period (read-only)
  const [advances, setAdvances]     = useState<{ date: string; amount: number; createdByName?: string; description?: string }[]>([]);
  const payPeriod = currentPayPeriod(new Date());

  // Action state
  const [acting, setActing]         = useState(false);

  const canEdit = currentUser?.role === 'admin' || currentUser?.role === 'hr';

  // ── Load employee ──
  const loadEmployee = async () => {
    if (!employeeId) return;
    setLoading(true);
    const result = await WorkforceController.getEmployee(employeeId);
    if (result.success) setEmployee(result.data);
    else setError(friendlyError(result.error));
    setLoading(false);
  };

  useEffect(() => { loadEmployee(); }, [employeeId]);

  useEffect(() => {
    if (!employee?.userId) { setAdvances([]); return; }
    HRController.getSalaryAdvances(employee.userId, payPeriod.from, payPeriod.to)
      .then(r => setAdvances(r.success ? r.data ?? [] : []));
  }, [employee?.userId, payPeriod.from]);

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
      <div className="p-4 sm:p-6">
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
    { id: 'biometrics', label: 'Biometrics', icon: Fingerprint },
    { id: 'performance', label: 'Performance', icon: TrendingUp },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">

      {/* ── Back ── */}
      <button
        onClick={() => navigate('/workforce/employees')}
        className="flex items-center gap-2 min-h-11 text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="size-4" /> All Employees
      </button>

      {/* ── Profile card ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-5">

          {/* Avatar */}
          <div className={`size-16 rounded-2xl bg-gradient-to-br ${avatarGrad(employee.id)} flex items-center justify-center text-white text-xl font-bold shrink-0`}>
            {initials(employee.fullName)}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0">
                <h1 dir="auto" className="text-xl font-bold text-gray-900 break-words">{employee.fullName}</h1>
                <p dir="auto" className="text-sm text-gray-500 mt-0.5 break-words">
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
            <div className="mt-4 grid grid-cols-1 min-[400px]:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              {employee.email && (
                <div className="flex items-center gap-2 text-sm text-gray-600 min-w-0">
                  <Mail className="size-4 text-gray-400 shrink-0" />
                  <span className="truncate">{employee.email}</span>
                </div>
              )}
              {employee.phone && (
                <div className="flex items-center gap-2 text-sm text-gray-600 min-w-0">
                  <Phone className="size-4 text-gray-400 shrink-0" />
                  <span>{employee.phone}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-gray-600 min-w-0">
                <Calendar className="size-4 text-gray-400 shrink-0" />
                <span>Hired {fmt(employee.hireDate)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 min-w-0">
                <DollarSign className="size-4 text-gray-400 shrink-0" />
                <span className="whitespace-nowrap">{cur(employee.monthlySalary)}/mo</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 min-w-0">
                <Clock className="size-4 text-gray-400 shrink-0" />
                <span>{employee.shiftStart} – {employee.shiftEnd}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 min-w-0">
                <Building2 className="size-4 text-gray-400 shrink-0" />
                <span dir="auto" className="break-words min-w-0">{employee.department}</span>
              </div>
            </div>

            {employee.notes && (
              <p dir="auto" className="mt-3 text-sm text-gray-500 italic break-words">"{employee.notes}"</p>
            )}
          </div>

          {/* Actions */}
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                onClick={() => setShowEdit(true)}
                className="flex items-center gap-2 px-3 py-2 min-h-11 text-sm border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Edit2 className="size-4" /> Edit
              </button>
              {employee.status === 'active' ? (
                <button
                  onClick={handleDeactivate}
                  disabled={acting}
                  className="flex items-center gap-2 px-3 py-2 min-h-11 text-sm border border-red-200 rounded-xl text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <UserX className="size-4" /> Deactivate
                </button>
              ) : (
                <button
                  onClick={handleReactivate}
                  disabled={acting}
                  className="flex items-center gap-2 px-3 py-2 min-h-11 text-sm border border-emerald-200 rounded-xl text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                >
                  <UserCheck className="size-4" /> Reactivate
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Salary advances ── */}
      {employee.userId && (() => {
        const taken = advances.reduce((s, a) => s + a.amount, 0);
        const left = employee.monthlySalary - taken;
        return (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6">
            <h2 className="text-base font-semibold text-gray-900">Salary advances</h2>
            <p className="mt-1 text-sm text-gray-600">
              Salary {CURRENCY} {cur(employee.monthlySalary)} · Taken {CURRENCY} {cur(taken)} ·{' '}
              {left < 0
                ? <span className="font-medium text-red-600">Owes {CURRENCY} {cur(-left)}</span>
                : <span className="font-medium text-gray-900">Left {CURRENCY} {cur(left)}</span>}
              {' '}(paid on {payPeriod.payday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})
            </p>
            {advances.length === 0 ? (
              <p className="mt-3 text-sm text-gray-400">No advances this pay period.</p>
            ) : (
              <ul className="mt-3 divide-y divide-gray-50">
                {advances.map((a, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="text-gray-900">{fmt(`${a.date}T00:00:00`)}{a.createdByName && <span className="text-gray-500"> · by {a.createdByName}</span>}</p>
                      {a.description && <p dir="auto" className="text-gray-500 break-words">{a.description}</p>}
                    </div>
                    <span className="font-medium text-gray-900 whitespace-nowrap">{CURRENCY} {cur(a.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })()}

      {/* ── Tabs ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 flex overflow-x-auto overscroll-x-contain no-scrollbar">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex shrink-0 items-center gap-2 px-4 sm:px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors ${
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

        <div className="p-4 sm:p-6">
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

              {/* ── Biometrics Tab ── */}
              {activeTab === 'biometrics' && (
                <BiometricsTab employee={employee} onRefresh={loadEmployee} />
              )}

              {/* ── Performance Tab (loads its own data) ── */}
              {activeTab === 'performance' && (
                <EmployeePerformanceTab employee={employee} />
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
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[
          { label: 'Days Present',   value: present,           color: 'text-emerald-600' },
          { label: 'Late Arrivals',  value: late,              color: 'text-amber-600' },
          { label: 'Overtime (min)', value: totalOT,           color: 'text-blue-600' },
        ].map(s => (
          <div key={s.label} className="bg-gray-50 rounded-xl p-3 sm:p-4 text-center min-w-0">
            <p className={`text-xl sm:text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem]">
          <thead>
            <tr className="border-b border-gray-100">
              {['Date', 'Check In', 'Check Out', 'Late (min)', 'OT (min)', 'Status'].map(h => (
                <th key={h} className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {logs.map(log => (
              <tr key={log.id}>
                <td className="px-3 py-3 text-sm text-gray-900 whitespace-nowrap">{log.logDate}</td>
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
      <table className="w-full min-w-[36rem]">
        <thead>
          <tr className="border-b border-gray-100">
            {['Period', 'Base Salary', 'Present Days', 'Late Deduction', 'OT Bonus', 'Net Pay', 'Status'].map(h => (
              <th key={h} className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {payrolls.map(p => (
            <tr key={p.id}>
              <td className="px-3 py-3 text-sm text-gray-900">{p.month}/{p.year}</td>
              <td className="px-3 py-3 text-sm text-gray-700 whitespace-nowrap">{cur(p.monthlySalary)}</td>
              <td className="px-3 py-3 text-sm text-gray-700">{p.presentDays}/{p.workingDays}</td>
              <td className="px-3 py-3 text-sm text-red-600 whitespace-nowrap">-{cur(p.lateDeduction)}</td>
              <td className="px-3 py-3 text-sm text-emerald-600 whitespace-nowrap">+{cur(p.overtimeBonus)}</td>
              <td className="px-3 py-3 text-sm font-bold text-gray-900 whitespace-nowrap">{cur(p.netSalary)}</td>
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

      <div className="text-center px-2">
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
        <div className="flex flex-wrap justify-center gap-3">
          {employee.hasFingerprint ? (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-2 px-4 py-2 min-h-11 text-sm border border-red-200 text-red-600 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <XCircle className="size-4" /> Remove Fingerprint
            </button>
          ) : null}
          <a
            href="#/fingerprint-checkin"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 min-h-11 text-sm bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors"
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
    <span className={`whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())}
    </span>
  );
}
