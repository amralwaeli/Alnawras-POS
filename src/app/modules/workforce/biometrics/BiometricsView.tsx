import { useState, useEffect, useCallback } from 'react';
import { Fingerprint, RefreshCw, XCircle, CheckCircle, Search, ExternalLink } from 'lucide-react';
import { usePOS } from '../../../context/POSContext';
import { WorkforceController } from '../../../controllers/WorkforceController';
import { HRController } from '../../../controllers/HRController';
import { FingerprintScanner } from '../../../services/FingerprintScanner';
import { EmployeeWithUser } from '../../../models/types';

// ─── Fingerprint Enrollment Modal ────────────────────────────────────────────
function FingerprintEnrollModal({
  employee,
  enrolledBy,
  onClose,
  onDone,
}: {
  employee: EmployeeWithUser;
  enrolledBy: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const REQUIRED = 3;
  const [phase, setPhase]         = useState<'connect' | 'scan' | 'confirm' | 'saving' | 'done' | 'error'>('connect');
  const [scanCount, setScanCount] = useState(0);
  const [templates, setTemplates] = useState<string[]>([]);
  const [quality, setQuality]     = useState(0);
  const [errorMsg, setErrorMsg]   = useState('');
  const [deviceName, setDeviceName] = useState('');

  const connect = async () => {
    const res = await FingerprintScanner.connect();
    setDeviceName(res.deviceName || 'Demo Mode');
    setPhase('scan');
  };

  const doScan = async () => {
    const result = await FingerprintScanner.simulateCapture(employee.employeeId + scanCount);
    if (result.success && result.template) {
      const newTemplates = [...templates, result.template];
      setTemplates(newTemplates);
      setQuality(result.quality || 0);
      const next = scanCount + 1;
      setScanCount(next);
      if (next >= REQUIRED) setPhase('confirm');
    } else {
      setErrorMsg(result.error || 'Scan failed');
      setPhase('error');
    }
  };

  const save = async () => {
    setPhase('saving');
    const res = await HRController.enrollFingerprint(
      employee.employeeId,
      templates[templates.length - 1],
      0,
      quality,
      enrolledBy
    );
    if (res.success) {
      setPhase('done');
      setTimeout(() => onDone(), 1800);
    } else {
      setErrorMsg(res.error || 'Failed to save');
      setPhase('error');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-bold text-gray-900">Enroll Fingerprint</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <XCircle className="size-5 text-gray-400" />
          </button>
        </div>

        <div className="text-center space-y-5">
          <div className={`mx-auto size-20 rounded-2xl flex items-center justify-center ${
            phase === 'done' ? 'bg-emerald-50' : phase === 'error' ? 'bg-red-50' : 'bg-amber-50'
          }`}>
            <Fingerprint className={`size-10 ${
              phase === 'done' ? 'text-emerald-500' : phase === 'error' ? 'text-red-500' : 'text-amber-500'
            } ${phase === 'scan' ? 'animate-pulse' : ''}`} />
          </div>

          <div>
            <p className="font-semibold text-gray-900">{employee.fullName}</p>
            <p className="text-sm text-gray-500">{employee.employeeId}</p>
          </div>

          {/* Progress dots */}
          <div className="flex justify-center gap-2">
            {Array.from({ length: REQUIRED }, (_, i) => (
              <div key={i} className={`size-4 rounded-full border-2 transition-all ${
                i < scanCount ? 'bg-amber-500 border-amber-500' : 'border-gray-300'
              }`} />
            ))}
          </div>

          {/* Phase messages */}
          {phase === 'connect' && (
            <>
              <p className="text-sm text-gray-600">Connect a fingerprint scanner or use demo mode to enroll.</p>
              <button onClick={connect}
                className="w-full py-3 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 transition-colors">
                Connect Scanner / Demo Mode
              </button>
            </>
          )}

          {phase === 'scan' && scanCount < REQUIRED && (
            <>
              <p className="text-sm text-gray-600">
                Scan {scanCount + 1} of {REQUIRED} — {deviceName && `(${deviceName})`}
              </p>
              <button onClick={doScan}
                className="w-full py-3 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 transition-colors">
                Scan Finger
              </button>
            </>
          )}

          {phase === 'confirm' && (
            <>
              <p className="text-sm text-gray-600">All {REQUIRED} scans captured. Quality: <strong>{quality}%</strong></p>
              <button onClick={save}
                className="w-full py-3 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition-colors">
                Save Enrollment
              </button>
            </>
          )}

          {phase === 'saving' && (
            <p className="text-sm text-gray-600 flex items-center justify-center gap-2">
              <RefreshCw className="size-4 animate-spin" /> Saving…
            </p>
          )}

          {phase === 'done' && (
            <p className="text-sm text-emerald-600 flex items-center justify-center gap-2">
              <CheckCircle className="size-5" /> Fingerprint enrolled successfully!
            </p>
          )}

          {phase === 'error' && (
            <>
              <p className="text-sm text-red-600">{errorMsg}</p>
              <button onClick={() => { setPhase('scan'); setScanCount(0); setTemplates([]); }}
                className="w-full py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm hover:bg-gray-50 transition-colors">
                Try Again
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main BiometricsView ──────────────────────────────────────────────────────
export function BiometricsView() {
  const { currentUser } = usePOS();
  const [employees, setEmployees]     = useState<EmployeeWithUser[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [enrollTarget, setEnrollTarget] = useState<EmployeeWithUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await WorkforceController.getEmployees({ status: 'active' });
    if (r.success) setEmployees(r.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDeleteFP = async (emp: EmployeeWithUser) => {
    if (!confirm(`Remove fingerprint for ${emp.fullName}?`)) return;
    await HRController.deleteFingerprint(emp.employeeId);
    load();
  };

  const filtered = employees.filter(e =>
    e.fullName.toLowerCase().includes(search.toLowerCase()) ||
    (e.employeeNumber ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const enrolled  = employees.filter(e => e.hasFingerprint).length;
  const pending   = employees.length - enrolled;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Biometrics</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {enrolled} enrolled · {pending} pending
          </p>
        </div>
        <a
          href="/fingerprint-checkin"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white text-sm font-medium rounded-xl hover:bg-amber-600 transition-colors"
        >
          <ExternalLink className="size-4" /> Open Kiosk
        </a>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: 'Enrolled',     value: enrolled, color: 'bg-emerald-50 text-emerald-600', icon: CheckCircle },
          { label: 'Not Enrolled', value: pending,  color: 'bg-gray-50 text-gray-400',       icon: Fingerprint },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{s.label}</p>
              <div className={`size-9 rounded-xl flex items-center justify-center ${s.color}`}>
                <s.icon className="size-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search employees…"
          className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="size-6 text-amber-500 animate-spin" />
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(emp => (
              <div key={emp.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                <div className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${
                  emp.hasFingerprint ? 'bg-emerald-100' : 'bg-gray-100'
                }`}>
                  <Fingerprint className={`size-5 ${emp.hasFingerprint ? 'text-emerald-600' : 'text-gray-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{emp.fullName}</p>
                  <p className="text-xs text-gray-400">{emp.employeeNumber ?? emp.employeeId} · {emp.role}</p>
                </div>
                <div className="flex items-center gap-2">
                  {emp.hasFingerprint ? (
                    <>
                      <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">Enrolled</span>
                      <button
                        onClick={() => setEnrollTarget(emp)}
                        className="text-xs text-gray-500 hover:text-amber-600 px-2.5 py-1 rounded-lg hover:bg-amber-50 transition-colors"
                      >
                        Re-enroll
                      </button>
                      <button
                        onClick={() => handleDeleteFP(emp)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Remove fingerprint"
                      >
                        <XCircle className="size-4" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setEnrollTarget(emp)}
                      className="flex items-center gap-1.5 text-xs font-medium text-amber-600 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-xl transition-colors"
                    >
                      <Fingerprint className="size-3.5" /> Enroll
                    </button>
                  )}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="py-12 text-center text-sm text-gray-400">No employees found.</div>
            )}
          </div>
        )}
      </div>

      {enrollTarget && currentUser && (
        <FingerprintEnrollModal
          employee={enrollTarget}
          enrolledBy={currentUser.id}
          onClose={() => setEnrollTarget(null)}
          onDone={() => { setEnrollTarget(null); load(); }}
        />
      )}
    </div>
  );
}
