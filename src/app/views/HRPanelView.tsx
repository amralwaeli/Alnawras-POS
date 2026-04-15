import { useState, useEffect, useCallback } from 'react';
import { usePOS } from '../context/POSContext';
import { HRController } from '../controllers/HRController';
import { FingerprintScanner } from '../services/FingerprintScanner';
import { Employee, AttendanceLog, PayrollSummary } from '../models/types';
import {
  Users, Fingerprint, Clock, FileText, Plus, Edit2, Trash2,
  CheckCircle, XCircle, AlertCircle, RefreshCw, Download,
  ChevronRight, ShieldOff, Wifi, Search, Calendar, DollarSign,
  UserCheck, UserX, TrendingUp, Activity
} from 'lucide-react';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const fmt = (d?: Date) => d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const currency = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─────────────────────────────────────────────
// Sub: Employee Form Modal
// ─────────────────────────────────────────────
function EmployeeFormModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: Employee;
  onSave: (data: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    employeeId: initial?.employeeId || `EMP${Date.now().toString().slice(-4)}`,
    fullName: initial?.fullName || '',
    role: initial?.role || 'waiter',
    monthlySalary: initial?.monthlySalary || 0,
    shiftStart: initial?.shiftStart || '09:00',
    shiftEnd: initial?.shiftEnd || '18:00',
    earlyCheckinMinutes: initial?.earlyCheckinMinutes ?? 5,
    lateCheckoutMinutes: initial?.lateCheckoutMinutes ?? 5,
    status: initial?.status || 'active',
    branchId: initial?.branchId || 'branch-1',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!form.fullName.trim()) { setError('Full name is required'); return; }
    if (!form.employeeId.trim()) { setError('Employee ID is required'); return; }
    setLoading(true);
    setError('');
    try {
      await onSave(form as any);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const field = (label: string, key: keyof typeof form, type = 'text', extra?: any) => (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        type={type}
        value={form[key] as string}
        onChange={e => setForm(f => ({ ...f, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        {...extra}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">{initial ? 'Edit Employee' : 'Register Employee'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <XCircle className="size-5 text-gray-400" />
          </button>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              <AlertCircle className="size-4 shrink-0" /> {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            {field('Full Name', 'fullName')}
            {field('Employee ID', 'employeeId', 'text', { disabled: !!initial })}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Role</label>
              <select
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {['admin', 'cashier', 'waiter', 'kitchen', 'hr', 'juice'].map(r => (
                  <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                ))}
              </select>
            </div>
            {field('Monthly Salary', 'monthlySalary', 'number')}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {field('Shift Start', 'shiftStart', 'time')}
            {field('Shift End', 'shiftEnd', 'time')}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {field('Early Check-in (min)', 'earlyCheckinMinutes', 'number')}
            {field('Late Check-out (min)', 'lateCheckoutMinutes', 'number')}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <div className="flex gap-3">
              {['active', 'inactive'].map(s => (
                <button
                  key={s}
                  onClick={() => setForm(f => ({ ...f, status: s as any }))}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    form.status === s
                      ? s === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {loading && <RefreshCw className="size-4 animate-spin" />}
            {initial ? 'Save Changes' : 'Register Employee'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub: Fingerprint Enrollment Modal
// ─────────────────────────────────────────────
function FingerprintEnrollModal({
  employee,
  enrolledBy,
  onClose,
  onDone,
}: {
  employee: Employee;
  enrolledBy: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<'connect' | 'scan' | 'confirm' | 'saving' | 'done' | 'error'>('connect');
  const [scanCount, setScanCount] = useState(0);
  const [templates, setTemplates] = useState<string[]>([]);
  const [quality, setQuality] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [scanLog, setScanLog] = useState<{ attempt: number; quality: number; ok: boolean }[]>([]);
  const REQUIRED_SCANS = 3;

  const connectScanner = async () => {
    const res = await FingerprintScanner.connect();
    if (res.success) {
      setDeviceName(res.deviceName || 'Scanner');
      setPhase('scan');
    } else {
      // Offer demo mode if WebHID not supported
      setDeviceName('Demo Mode (No Scanner)');
      setPhase('scan');
    }
  };

  const doScan = async () => {
    if (scanCount >= REQUIRED_SCANS) return;
    setPhase('scan');
    const result = await FingerprintScanner.simulateCapture(employee.employeeId + scanCount);
    const newLog = { attempt: scanCount + 1, quality: result.quality || 0, ok: result.success };
    setScanLog(prev => [...prev, newLog]);
    if (result.success && result.template) {
      setTemplates(prev => [...prev, result.template!]);
      setQuality(result.quality || 0);
      const newCount = scanCount + 1;
      setScanCount(newCount);
      if (newCount >= REQUIRED_SCANS) setPhase('confirm');
    } else {
      setErrorMsg(result.error || 'Scan failed');
      setPhase('error');
    }
  };

  const saveEnrollment = async () => {
    setPhase('saving');
    // Use the best template (last scan — could also average features)
    const bestTemplate = templates[templates.length - 1];
    const res = await HRController.enrollFingerprint(
      employee.employeeId,
      bestTemplate,
      0, // right index finger
      quality,
      enrolledBy
    );
    if (res.success) {
      setPhase('done');
      setTimeout(() => onDone(), 1800);
    } else {
      setErrorMsg(res.error || 'Failed to save fingerprint');
      setPhase('error');
    }
  };

  const ScanDot = ({ filled }: { filled: boolean }) => (
    <div className={`size-4 rounded-full border-2 transition-all ${filled ? 'bg-amber-500 border-amber-500' : 'border-gray-300'}`} />
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">Fingerprint Enrollment</p>
              <h2 className="font-bold text-lg">{employee.fullName}</h2>
              <p className="text-sm text-gray-400">{employee.employeeId}</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
              <XCircle className="size-5" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {phase === 'connect' && (
            <div className="text-center space-y-4">
              <div className="size-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto">
                <Wifi className="size-10 text-gray-400" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Connect Scanner</p>
                <p className="text-sm text-gray-500 mt-1">Plug in your USB fingerprint scanner, then click connect.</p>
              </div>
              <button
                onClick={connectScanner}
                className="w-full py-3 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 transition-colors"
              >
                Connect USB Scanner
              </button>
              <button
                onClick={() => { setDeviceName('Demo Mode'); setPhase('scan'); }}
                className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Use Demo Mode (no scanner)
              </button>
            </div>
          )}

          {(phase === 'scan' || phase === 'confirm') && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                <CheckCircle className="size-3.5 text-emerald-500" />
                {deviceName}
              </div>

              {/* Fingerprint icon + animation */}
              <div className="flex justify-center">
                <div className={`relative size-28 rounded-full flex items-center justify-center
                  ${phase === 'scan' && scanCount < REQUIRED_SCANS
                    ? 'bg-amber-50 ring-4 ring-amber-200 ring-offset-2 animate-pulse'
                    : 'bg-emerald-50 ring-4 ring-emerald-200 ring-offset-2'}
                `}>
                  <Fingerprint className={`size-14 ${
                    phase === 'confirm' ? 'text-emerald-500' : 'text-amber-500'
                  }`} />
                  {phase === 'confirm' && (
                    <div className="absolute -bottom-1 -right-1 size-8 bg-emerald-500 rounded-full flex items-center justify-center">
                      <CheckCircle className="size-5 text-white" />
                    </div>
                  )}
                </div>
              </div>

              {/* Scan progress dots */}
              <div className="text-center space-y-2">
                <div className="flex justify-center gap-3">
                  {Array.from({ length: REQUIRED_SCANS }).map((_, i) => (
                    <ScanDot key={i} filled={i < scanCount} />
                  ))}
                </div>
                <p className="text-sm text-gray-500">
                  {phase === 'confirm'
                    ? 'All scans complete — ready to save'
                    : `Scan ${scanCount + 1} of ${REQUIRED_SCANS} — place finger on scanner`}
                </p>
              </div>

              {/* Scan log */}
              {scanLog.length > 0 && (
                <div className="space-y-1.5">
                  {scanLog.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
                      {s.ok
                        ? <CheckCircle className="size-3.5 text-emerald-500 shrink-0" />
                        : <XCircle className="size-3.5 text-red-500 shrink-0" />}
                      Scan {s.attempt}: Quality {s.quality}%
                    </div>
                  ))}
                </div>
              )}

              {phase === 'scan' && scanCount < REQUIRED_SCANS && (
                <button
                  onClick={doScan}
                  className="w-full py-3 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 transition-colors flex items-center justify-center gap-2"
                >
                  <Fingerprint className="size-5" />
                  Scan Finger ({scanCount}/{REQUIRED_SCANS})
                </button>
              )}

              {phase === 'confirm' && (
                <div className="flex gap-3">
                  <button
                    onClick={() => { setScanCount(0); setTemplates([]); setScanLog([]); setPhase('scan'); }}
                    className="flex-1 py-3 border border-gray-200 text-gray-600 rounded-xl font-medium hover:bg-gray-50 transition-colors"
                  >
                    Re-scan
                  </button>
                  <button
                    onClick={saveEnrollment}
                    className="flex-1 py-3 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition-colors"
                  >
                    Save Fingerprint
                  </button>
                </div>
              )}
            </div>
          )}

          {phase === 'saving' && (
            <div className="text-center py-8 space-y-3">
              <RefreshCw className="size-10 text-amber-500 animate-spin mx-auto" />
              <p className="font-medium text-gray-700">Encrypting &amp; saving fingerprint...</p>
            </div>
          )}

          {phase === 'done' && (
            <div className="text-center py-8 space-y-3">
              <div className="size-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto">
                <CheckCircle className="size-9 text-emerald-500" />
              </div>
              <div>
                <p className="font-bold text-gray-900">Enrolled Successfully!</p>
                <p className="text-sm text-gray-500 mt-1">Fingerprint linked to {employee.fullName}</p>
              </div>
            </div>
          )}

          {phase === 'error' && (
            <div className="text-center py-8 space-y-3">
              <div className="size-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto">
                <XCircle className="size-9 text-red-500" />
              </div>
              <div>
                <p className="font-bold text-gray-900">Enrollment Failed</p>
                <p className="text-sm text-red-600 mt-1">{errorMsg}</p>
              </div>
              <button
                onClick={() => { setScanCount(0); setTemplates([]); setScanLog([]); setPhase('scan'); }}
                className="px-5 py-2 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub: Attendance Log Table
// ─────────────────────────────────────────────
function AttendanceTab() {
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await HRController.getAttendanceLogs({ date: filterDate });
    if (res.success && res.data) setLogs(res.data);
    setLoading(false);
  }, [filterDate]);

  useEffect(() => { load(); }, [load]);

  const filtered = logs.filter(l =>
    l.fullName.toLowerCase().includes(search.toLowerCase()) ||
    l.employeeId.toLowerCase().includes(search.toLowerCase())
  );

  const statusStyle: Record<string, string> = {
    'on-time': 'bg-emerald-100 text-emerald-700',
    late: 'bg-red-100 text-red-700',
    'early-leave': 'bg-orange-100 text-orange-700',
    present: 'bg-blue-100 text-blue-700',
    absent: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search employee..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <input
          type="date"
          value={filterDate}
          onChange={e => setFilterDate(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        <button onClick={load} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <RefreshCw className={`size-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="py-20 text-center text-gray-400 text-sm">Loading attendance...</div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-gray-400 text-sm">No attendance records for this date</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  {['Employee', 'ID', 'Shift', 'Check In', 'Check Out', 'Late', 'Overtime', 'Status'].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="size-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-bold">
                          {log.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <span className="font-medium text-gray-900">{log.fullName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{log.employeeId}</td>
                    <td className="px-4 py-3 text-gray-500">{log.scheduledStart} – {log.scheduledEnd}</td>
                    <td className="px-4 py-3">{fmt(log.checkInTime)}</td>
                    <td className="px-4 py-3">{fmt(log.checkOutTime)}</td>
                    <td className="px-4 py-3">{log.lateMinutes > 0 ? <span className="text-red-600">{log.lateMinutes}m</span> : '—'}</td>
                    <td className="px-4 py-3">{log.overtimeMinutes > 0 ? <span className="text-emerald-600">{log.overtimeMinutes}m</span> : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle[log.status] || 'bg-gray-100 text-gray-600'}`}>
                        {log.status.replace('-', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub: Payroll Tab
// ─────────────────────────────────────────────
function PayrollTab({ currentUserId }: { currentUserId: string }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payroll, setPayroll] = useState<PayrollSummary[]>([]);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [computing, setComputing] = useState<string | null>(null);

  const loadEmployees = async () => {
    const res = await HRController.getEmployees();
    if (res.success && res.data) setEmployees(res.data);
  };

  const loadPayroll = async () => {
    setLoading(true);
    const res = await HRController.getPayroll(month, year);
    if (res.success && res.data) setPayroll(res.data);
    setLoading(false);
  };

  useEffect(() => { loadEmployees(); }, []);
  useEffect(() => { loadPayroll(); }, [month, year]);

  const computeAll = async () => {
    setLoading(true);
    for (const emp of employees.filter(e => e.status === 'active')) {
      setComputing(emp.employeeId);
      await HRController.computePayroll(emp.employeeId, month, year, currentUserId);
    }
    setComputing(null);
    await loadPayroll();
    setLoading(false);
  };

  const exportCSV = () => {
    const rows = [
      ['Employee', 'ID', 'Monthly Salary', 'Present', 'Absent', 'Late (min)', 'OT (min)', 'Deduction', 'OT Bonus', 'Net Salary', 'Status'],
      ...payroll.map(p => [
        p.fullName, p.employeeId, p.monthlySalary, p.presentDays, p.absentDays,
        p.totalLateMinutes, p.totalOvertimeMinutes, p.lateDeduction, p.overtimeBonus, p.netSalary, p.status
      ])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv,' + encodeURIComponent(csv);
    a.download = `payroll-${year}-${String(month).padStart(2, '0')}.csv`;
    a.click();
  };

  const monthName = new Date(year, month - 1).toLocaleString('en-US', { month: 'long' });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={month}
          onChange={e => setMonth(Number(e.target.value))}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>{new Date(2000, i).toLocaleString('en-US', { month: 'long' })}</option>
          ))}
        </select>
        <input
          type="number"
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          min={2020} max={2099}
          className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        <button
          onClick={computeAll}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
        >
          {loading ? <RefreshCw className="size-4 animate-spin" /> : <TrendingUp className="size-4" />}
          Compute All
        </button>
        {payroll.length > 0 && (
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            <Download className="size-4" /> Export CSV
          </button>
        )}
      </div>

      {computing && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 text-amber-700 rounded-lg text-sm">
          <RefreshCw className="size-4 animate-spin" /> Computing payroll for {computing}...
        </div>
      )}

      {payroll.length === 0 ? (
        <div className="py-20 text-center text-gray-400 text-sm">
          No payroll computed for {monthName} {year}.<br />
          Click "Compute All" to generate payroll.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  {['Employee', 'Base Salary', 'Present', 'Absent', 'Late', 'OT', 'Deduction', 'OT Bonus', 'Net Salary', 'Status'].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {payroll.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{p.fullName}</td>
                    <td className="px-4 py-3 text-gray-600">{currency(p.monthlySalary)}</td>
                    <td className="px-4 py-3 text-emerald-600">{p.presentDays}</td>
                    <td className="px-4 py-3 text-red-600">{p.absentDays}</td>
                    <td className="px-4 py-3 text-orange-600">{p.totalLateMinutes}m</td>
                    <td className="px-4 py-3 text-blue-600">{p.totalOvertimeMinutes}m</td>
                    <td className="px-4 py-3 text-red-600">-{currency(p.lateDeduction)}</td>
                    <td className="px-4 py-3 text-emerald-600">+{currency(p.overtimeBonus)}</td>
                    <td className="px-4 py-3 font-bold text-gray-900">{currency(p.netSalary)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                        p.status === 'approved' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-6 text-sm">
            <span className="text-gray-500">Total Net Payroll:</span>
            <span className="font-bold text-gray-900 text-base">
              {currency(payroll.reduce((s, p) => s + p.netSalary, 0))}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN HR PANEL VIEW
// ─────────────────────────────────────────────
export function HRPanelView() {
  const { currentUser } = usePOS();
  const [activeTab, setActiveTab] = useState<'employees' | 'attendance' | 'payroll'>('employees');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editEmployee, setEditEmployee] = useState<Employee | undefined>();
  const [enrollEmployee, setEnrollEmployee] = useState<Employee | null>(null);
  const [error, setError] = useState('');

  if (!currentUser) return null;
  if (currentUser.role !== 'admin' && currentUser.role !== 'hr') {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <div className="size-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldOff className="size-6 text-gray-400" />
          </div>
          <h2 className="font-semibold text-gray-800 mb-1">Access Restricted</h2>
          <p className="text-sm text-gray-500">Only Admin and HR can access this panel</p>
        </div>
      </div>
    );
  }

  const loadEmployees = async () => {
    setLoading(true);
    const res = await HRController.getEmployees();
    if (res.success && res.data) setEmployees(res.data);
    else setError(res.error || 'Failed to load employees');
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => { loadEmployees(); }, []);

  const handleSave = async (data: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (editEmployee) {
      const res = await HRController.updateEmployee(editEmployee.employeeId, data);
      if (!res.success) throw new Error(res.error);
    } else {
      const res = await HRController.addEmployee(data);
      if (!res.success) throw new Error(res.error);
    }
    setShowForm(false);
    setEditEmployee(undefined);
    await loadEmployees();
  };

  const handleDelete = async (emp: Employee) => {
    if (!confirm(`Delete ${emp.fullName}? This cannot be undone.`)) return;
    const res = await HRController.deleteEmployee(emp.employeeId);
    if (res.success) await loadEmployees();
    else setError(res.error || 'Delete failed');
  };

  const handleDeleteFingerprint = async (emp: Employee) => {
    if (!confirm(`Remove fingerprint for ${emp.fullName}?`)) return;
    await HRController.deleteFingerprint(emp.employeeId);
    await loadEmployees();
  };

  const filtered = employees.filter(e =>
    e.fullName.toLowerCase().includes(search.toLowerCase()) ||
    e.employeeId.toLowerCase().includes(search.toLowerCase())
  );

  const active = employees.filter(e => e.status === 'active').length;
  const withFP = employees.filter(e => e.hasFingerprint).length;

  const tabs = [
    { key: 'employees', label: 'Employees', icon: Users },
    { key: 'attendance', label: 'Attendance', icon: Clock },
    { key: 'payroll', label: 'Payroll', icon: DollarSign },
  ] as const;

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-6 space-y-6 max-w-7xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">HR Panel</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage employees, fingerprints &amp; payroll</p>
          </div>
          {activeTab === 'employees' && (
            <button
              onClick={() => { setEditEmployee(undefined); setShowForm(true); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 transition-colors shadow-sm"
            >
              <Plus className="size-4" /> Register Employee
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Employees', value: employees.length, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', ic: 'bg-blue-100' },
            { label: 'Active', value: active, icon: UserCheck, color: 'text-emerald-600', bg: 'bg-emerald-50', ic: 'bg-emerald-100' },
            { label: 'Inactive', value: employees.length - active, icon: UserX, color: 'text-red-600', bg: 'bg-red-50', ic: 'bg-red-100' },
            { label: 'Fingerprints Enrolled', value: withFP, icon: Fingerprint, color: 'text-amber-600', bg: 'bg-amber-50', ic: 'bg-amber-100' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-2xl p-4 border border-black/5`}>
              <div className={`size-9 ${s.ic} rounded-xl flex items-center justify-center mb-3`}>
                <s.icon className={`size-5 ${s.color}`} />
              </div>
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            <AlertCircle className="size-4" /> {error}
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600"><XCircle className="size-4" /></button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-100 w-fit">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === t.key
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              <t.icon className="size-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Employees Tab */}
        {activeTab === 'employees' && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or employee ID..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {loading ? (
              <div className="py-20 text-center text-gray-400 text-sm">Loading employees...</div>
            ) : filtered.length === 0 ? (
              <div className="py-20 text-center text-gray-400 text-sm">No employees found</div>
            ) : (
              <div className="grid gap-3">
                {filtered.map(emp => (
                  <div key={emp.id} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4 hover:border-amber-200 transition-colors">
                    {/* Avatar */}
                    <div className={`size-12 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0 ${
                      emp.status === 'inactive' ? 'bg-gray-300' : 'bg-gradient-to-br from-amber-400 to-orange-500'
                    }`}>
                      {emp.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900">{emp.fullName}</p>
                        <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{emp.employeeId}</span>
                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                          emp.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                        }`}>{emp.status}</span>
                        {emp.hasFingerprint && (
                          <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 flex items-center gap-1">
                            <Fingerprint className="size-3" /> Enrolled
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {emp.role.charAt(0).toUpperCase() + emp.role.slice(1)} · Shift: {emp.shiftStart}–{emp.shiftEnd} · Salary: {currency(emp.monthlySalary)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setEnrollEmployee(emp)}
                        title={emp.hasFingerprint ? 'Replace Fingerprint' : 'Enroll Fingerprint'}
                        className={`p-2 rounded-lg transition-colors ${
                          emp.hasFingerprint
                            ? 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                            : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                        }`}
                      >
                        <Fingerprint className="size-4" />
                      </button>
                      {emp.hasFingerprint && (
                        <button
                          onClick={() => handleDeleteFingerprint(emp)}
                          title="Remove fingerprint"
                          className="p-2 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 transition-colors"
                        >
                          <XCircle className="size-4" />
                        </button>
                      )}
                      <button
                        onClick={() => { setEditEmployee(emp); setShowForm(true); }}
                        className="p-2 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100 transition-colors"
                      >
                        <Edit2 className="size-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(emp)}
                        className="p-2 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 transition-colors"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'attendance' && <AttendanceTab />}
        {activeTab === 'payroll' && <PayrollTab currentUserId={currentUser.id} />}
      </div>

      {/* Modals */}
      {showForm && (
        <EmployeeFormModal
          initial={editEmployee}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditEmployee(undefined); }}
        />
      )}
      {enrollEmployee && (
        <FingerprintEnrollModal
          employee={enrollEmployee}
          enrolledBy={currentUser.id}
          onClose={() => setEnrollEmployee(null)}
          onDone={async () => { setEnrollEmployee(null); await loadEmployees(); }}
        />
      )}
    </div>
  );
}
