import { useState, useEffect, useRef } from 'react';
import { HRController } from '../../controllers/HRController';
import { FingerprintScanner } from '../../services/FingerprintScanner';
import { Employee, AttendanceLog } from '../../models/types';
import {
  Fingerprint, CheckCircle2, XCircle, Clock, UtensilsCrossed,
  Wifi, WifiOff, ArrowRight, AlertCircle, LogIn, LogOut, Activity
} from 'lucide-react';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type KioskPhase =
  | 'idle'        // Waiting — show clock + "place finger"
  | 'scanning'    // Scanner active, reading
  | 'processing'  // Matching against DB
  | 'success'     // Match found, check-in/out done
  | 'error';      // Failed scan or no match

interface ScanResult {
  action: 'check-in' | 'check-out';
  employee: Employee;
  log: AttendanceLog;
  statusLabel: string;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const fmt = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const fmtShort = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// ─────────────────────────────────────────────
// Idle screen — animated fingerprint + clock
// ─────────────────────────────────────────────
function IdleScreen({ onScan, now, scannerReady }: { onScan: () => void; now: Date; scannerReady: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 select-none">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-xl bg-amber-500 flex items-center justify-center">
          <UtensilsCrossed className="size-5 text-white" />
        </div>
        <div>
          <p className="font-bold text-white text-lg leading-tight">Alnawras</p>
          <p className="text-[11px] text-gray-500 uppercase tracking-wider">Fingerprint Attendance</p>
        </div>
      </div>

      {/* Clock */}
      <div className="text-center">
        <p className="text-7xl font-bold text-white tabular-nums tracking-tight">
          {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
        <p className="text-gray-400 mt-2 text-sm">
          {now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Fingerprint button */}
      <button
        onClick={onScan}
        disabled={!scannerReady}
        className="group relative flex flex-col items-center gap-4"
      >
        <div className={`relative size-44 rounded-full flex items-center justify-center transition-all duration-300
          ${scannerReady
            ? 'bg-amber-500/10 ring-4 ring-amber-500/30 hover:ring-amber-500/60 hover:bg-amber-500/20 cursor-pointer'
            : 'bg-gray-800 ring-4 ring-gray-700 cursor-not-allowed opacity-50'
          }`}
        >
          {/* Pulse rings */}
          {scannerReady && (
            <>
              <span className="absolute inset-0 rounded-full ring-4 ring-amber-400/20 animate-ping" />
              <span className="absolute inset-4 rounded-full ring-2 ring-amber-400/10 animate-ping [animation-delay:0.3s]" />
            </>
          )}
          <Fingerprint className={`size-20 transition-colors ${scannerReady ? 'text-amber-400 group-hover:text-amber-300' : 'text-gray-600'}`} />
        </div>
        <div className="text-center">
          <p className="font-semibold text-white">
            {scannerReady ? 'Place Finger to Scan' : 'Scanner Not Ready'}
          </p>
          <p className="text-sm text-gray-500 mt-0.5">
            {scannerReady ? 'Touch the fingerprint sensor' : 'Click "Connect Scanner" in the top bar'}
          </p>
        </div>
      </button>

      {/* Recent scans strip (last 3) shown as tiny avatars */}
    </div>
  );
}

// ─────────────────────────────────────────────
// Scanning screen — animated ring
// ─────────────────────────────────────────────
function ScanningScreen({ phase }: { phase: 'scanning' | 'processing' }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6">
      <div className="relative size-48 flex items-center justify-center">
        <span className="absolute inset-0 rounded-full ring-4 ring-amber-400/40 animate-ping" />
        <span className="absolute inset-4 rounded-full ring-2 ring-amber-400/20 animate-ping [animation-delay:0.2s]" />
        <div className="size-32 rounded-full bg-amber-500/10 flex items-center justify-center">
          {phase === 'scanning'
            ? <Fingerprint className="size-16 text-amber-400 animate-pulse" />
            : <Activity className="size-16 text-amber-400 animate-spin" />
          }
        </div>
      </div>
      <div className="text-center">
        <p className="text-2xl font-bold text-white">
          {phase === 'scanning' ? 'Reading Fingerprint…' : 'Identifying Employee…'}
        </p>
        <p className="text-gray-400 mt-1 text-sm">
          {phase === 'scanning' ? 'Keep your finger still' : 'Matching against enrolled records'}
        </p>
      </div>
      <div className="flex gap-2">
        {[0, 0.15, 0.3].map((d, i) => (
          <div
            key={i}
            className="size-2 bg-amber-500 rounded-full animate-bounce"
            style={{ animationDelay: `${d}s` }}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Success screen
// ─────────────────────────────────────────────
function SuccessScreen({ result }: { result: ScanResult }) {
  const isCheckIn = result.action === 'check-in';
  const isLate = result.log.lateMinutes > 0;
  const isEarlyLeave = result.log.earlyLeaveMinutes > 0;
  const hasOvertime = result.log.overtimeMinutes > 0;

  const statusColor = isLate ? 'text-red-400' :
    isEarlyLeave ? 'text-orange-400' :
    hasOvertime ? 'text-blue-400' : 'text-emerald-400';

  const bg = isCheckIn ? 'from-emerald-500/10 to-emerald-500/5' : 'from-blue-500/10 to-blue-500/5';

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-8">
      {/* Action badge */}
      <div className={`flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-gradient-to-r ${bg} border border-white/10`}>
        {isCheckIn
          ? <LogIn className="size-5 text-emerald-400" />
          : <LogOut className="size-5 text-blue-400" />
        }
        <span className={`font-bold text-lg ${isCheckIn ? 'text-emerald-400' : 'text-blue-400'}`}>
          {isCheckIn ? 'CHECK IN' : 'CHECK OUT'}
        </span>
      </div>

      {/* Avatar + name */}
      <div className="text-center">
        <div className="size-24 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4 ring-4 ring-amber-500/30">
          {result.employee.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
        </div>
        <p className="text-3xl font-bold text-white">{result.employee.fullName}</p>
        <p className="text-gray-400 text-sm mt-1">{result.employee.employeeId} · {result.employee.role}</p>
      </div>

      {/* Time card */}
      <div className="bg-gray-800/60 border border-white/10 rounded-2xl px-8 py-5 text-center">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
          {isCheckIn ? 'Check-in Time' : 'Check-out Time'}
        </p>
        <p className="text-4xl font-bold text-white tabular-nums">
          {fmtShort(isCheckIn ? result.log.checkInTime! : result.log.checkOutTime!)}
        </p>
        <p className="text-sm mt-2">
          <span className={`font-semibold ${statusColor}`}>{result.statusLabel}</span>
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Shift: {result.employee.shiftStart} – {result.employee.shiftEnd}
        </p>
      </div>

      <CheckCircle2 className="size-8 text-emerald-400 mt-2" />
    </div>
  );
}

// ─────────────────────────────────────────────
// Error screen
// ─────────────────────────────────────────────
function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-5">
      <div className="size-28 rounded-full bg-red-500/10 ring-4 ring-red-500/20 flex items-center justify-center">
        <XCircle className="size-16 text-red-400" />
      </div>
      <div className="text-center">
        <p className="text-2xl font-bold text-white">Not Recognized</p>
        <p className="text-red-400 mt-2 text-sm max-w-xs text-center">{message}</p>
      </div>
      <p className="text-gray-500 text-sm">Please try again or contact HR</p>
    </div>
  );
}

// ─────────────────────────────────────────────
// Recent Scans Log (sidebar on wide screens)
// ─────────────────────────────────────────────
function RecentLog({ logs }: { logs: { name: string; action: 'check-in' | 'check-out'; time: Date; status: string }[] }) {
  if (logs.length === 0) return null;
  return (
    <div className="absolute top-6 right-6 w-64 space-y-2">
      <p className="text-xs text-gray-600 uppercase tracking-wider font-semibold">Recent</p>
      {logs.slice(0, 6).map((l, i) => (
        <div key={i} className="flex items-center gap-3 bg-gray-900/60 rounded-xl px-3 py-2.5 border border-white/5">
          <div className="size-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {l.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">{l.name}</p>
            <p className="text-[11px] text-gray-500">{fmtShort(l.time)} · {l.action === 'check-in' ? 'In' : 'Out'}</p>
          </div>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
            l.status.includes('Late') ? 'bg-red-900/50 text-red-400' :
            l.status.includes('Early') ? 'bg-orange-900/50 text-orange-400' :
            'bg-emerald-900/50 text-emerald-400'
          }`}>
            {l.status.split(' ')[0]}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN KIOSK VIEW
// ─────────────────────────────────────────────
export function FingerprintCheckInView() {
  const [phase, setPhase] = useState<KioskPhase>('idle');
  const [now, setNow] = useState(new Date());
  const [scannerReady, setScannerReady] = useState(false);
  const [scannerName, setScannerName] = useState('');
  const [successResult, setSuccessResult] = useState<ScanResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [recentLogs, setRecentLogs] = useState<{
    name: string; action: 'check-in' | 'check-out'; time: Date; status: string;
  }[]>([]);
  const [demoMode, setDemoMode] = useState(false);
  const [demoEmployees, setDemoEmployees] = useState<Employee[]>([]);
  const [demoIndex, setDemoIndex] = useState(0);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>();

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Load demo employees for simulation
  useEffect(() => {
    HRController.getEmployees().then(res => {
      if (res.success && res.data) setDemoEmployees(res.data.filter(e => e.status === 'active'));
    });
  }, []);

  // Auto-reset back to idle after success/error
  const scheduleReset = (delay = 5000) => {
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      setPhase('idle');
      setSuccessResult(null);
      setErrorMsg('');
    }, delay);
  };

  const connectScanner = async () => {
    const res = await FingerprintScanner.connect();
    if (res.success) {
      setScannerName(res.deviceName || 'USB Scanner');
      setScannerReady(true);
      setDemoMode(false);
    } else {
      // Fall back to demo mode
      setScannerName('Demo Mode');
      setScannerReady(true);
      setDemoMode(true);
    }
  };

  const handleScan = async () => {
    if (phase !== 'idle') return;

    setPhase('scanning');

    // Step 1: Capture fingerprint
    let template: string;
    if (demoMode && demoEmployees.length > 0) {
      // In demo mode, cycle through enrolled employees
      const emp = demoEmployees[demoIndex % demoEmployees.length];
      setDemoIndex(i => i + 1);
      const scanRes = await FingerprintScanner.simulateCapture(emp.employeeId);
      if (!scanRes.success || !scanRes.template) {
        setPhase('error');
        setErrorMsg(scanRes.error || 'Scan failed');
        scheduleReset(4000);
        return;
      }
      template = scanRes.template;
    } else {
      const scanRes = await FingerprintScanner.capture();
      if (!scanRes.success || !scanRes.template) {
        setPhase('error');
        setErrorMsg(scanRes.error || 'Scan failed — try again');
        scheduleReset(4000);
        return;
      }
      template = scanRes.template;
    }

    // Step 2: Match against DB
    setPhase('processing');
    const matchRes = await HRController.matchFingerprint(template);

    if (!matchRes.success || !matchRes.employee) {
      setPhase('error');
      setErrorMsg(matchRes.error || 'Fingerprint not recognized');
      scheduleReset(4000);
      return;
    }

    // Step 3: Record check-in / check-out
    const recordRes = await HRController.recordScan(matchRes.employee, 'fingerprint');

    if (!recordRes.success) {
      setPhase('error');
      setErrorMsg(recordRes.error || 'Failed to record attendance');
      scheduleReset(4000);
      return;
    }

    // Step 4: Show success
    const result: ScanResult = {
      action: recordRes.action!,
      employee: matchRes.employee,
      log: recordRes.log!,
      statusLabel: recordRes.statusLabel!,
    };

    setSuccessResult(result);
    setPhase('success');

    // Add to recent log
    setRecentLogs(prev => [{
      name: matchRes.employee!.fullName,
      action: recordRes.action!,
      time: new Date(),
      status: recordRes.statusLabel!,
    }, ...prev].slice(0, 10));

    scheduleReset(6000);
  };

  // Demo: enable scanner in demo mode immediately for convenience
  const enableDemo = () => {
    setScannerName('Demo Mode');
    setScannerReady(true);
    setDemoMode(true);
  };

  return (
    <div className="h-screen bg-gray-950 flex flex-col overflow-hidden relative">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-lg bg-amber-500 flex items-center justify-center">
            <UtensilsCrossed className="size-4 text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-sm leading-tight">Alnawras</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Fingerprint Attendance Kiosk</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Live clock */}
          <span className="text-xs text-gray-500 font-mono">{fmt(now)}</span>

          {/* Scanner status */}
          <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${
            scannerReady
              ? 'bg-emerald-900/30 border-emerald-800/50 text-emerald-400'
              : 'bg-gray-800 border-gray-700 text-gray-500'
          }`}>
            {scannerReady ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
            {scannerReady ? scannerName : 'No Scanner'}
          </div>

          {!scannerReady && (
            <>
              <button
                onClick={connectScanner}
                className="text-xs px-3 py-1.5 bg-amber-500 text-white rounded-full hover:bg-amber-600 transition-colors font-medium"
              >
                Connect USB
              </button>
              <button
                onClick={enableDemo}
                className="text-xs px-3 py-1.5 border border-gray-700 text-gray-400 rounded-full hover:bg-gray-800 transition-colors"
              >
                Demo Mode
              </button>
            </>
          )}

          {/* Back to POS */}
          <a
            href="#/"
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors border border-gray-800 rounded-full px-3 py-1.5"
          >
            POS <ArrowRight className="size-3" />
          </a>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 relative overflow-hidden">
        {phase === 'idle' && (
          <IdleScreen
            onScan={handleScan}
            now={now}
            scannerReady={scannerReady}
          />
        )}
        {(phase === 'scanning' || phase === 'processing') && (
          <ScanningScreen phase={phase} />
        )}
        {phase === 'success' && successResult && (
          <SuccessScreen result={successResult} />
        )}
        {phase === 'error' && (
          <ErrorScreen message={errorMsg} />
        )}

        {/* Recent log sidebar */}
        <div className="hidden xl:block">
          <RecentLog logs={recentLogs} />
        </div>
      </div>

      {/* Bottom hint */}
      <div className="px-6 py-3 border-t border-white/5 flex items-center justify-between shrink-0">
        <p className="text-xs text-gray-600">
          {demoMode
            ? '⚠ Demo mode — scans cycle through enrolled employees'
            : 'Place registered finger on the USB scanner to check in or out'
          }
        </p>
        {phase !== 'idle' && (
          <button
            onClick={() => { setPhase('idle'); clearTimeout(resetTimer.current); }}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
