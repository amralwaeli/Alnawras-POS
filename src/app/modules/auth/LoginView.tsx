import { useState, useEffect, useRef, useCallback } from 'react';
import { usePOS } from '../../context/POSContext';
import { UtensilsCrossed } from 'lucide-react';

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;
const STORAGE_KEY = 'alnawras_login_attempts';

interface AttemptRecord { count: number; lockedUntil: number | null; }

function getAttemptRecord(): AttemptRecord {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { count: 0, lockedUntil: null };
  } catch { return { count: 0, lockedUntil: null }; }
}

function saveAttemptRecord(rec: AttemptRecord) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(rec));
}

interface LoginViewProps {
  onLoginSuccess: () => void;
}

export function LoginView({ onLoginSuccess }: LoginViewProps) {
  const { login } = usePOS();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const lockoutTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick down the lockout countdown every second
  useEffect(() => {
    const checkLockout = () => {
      const rec = getAttemptRecord();
      if (rec.lockedUntil && rec.lockedUntil > Date.now()) {
        const secs = Math.ceil((rec.lockedUntil - Date.now()) / 1000);
        setLockoutRemaining(secs);
      } else {
        setLockoutRemaining(0);
        if (lockoutTimer.current) { clearInterval(lockoutTimer.current); lockoutTimer.current = null; }
      }
    };
    checkLockout();
    lockoutTimer.current = setInterval(checkLockout, 1000);
    return () => { if (lockoutTimer.current) clearInterval(lockoutTimer.current); };
  }, []);

  const isLocked = lockoutRemaining > 0;

  const handleSubmit = useCallback(async (currentPin: string) => {
    if (currentPin.length !== 4 || loading || isLocked) return;

    const rec = getAttemptRecord();
    if (rec.lockedUntil && rec.lockedUntil > Date.now()) {
      setLockoutRemaining(Math.ceil((rec.lockedUntil - Date.now()) / 1000));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await login(currentPin);
      if (result.success) {
        saveAttemptRecord({ count: 0, lockedUntil: null });
        onLoginSuccess();
      } else {
        const newCount = rec.count + 1;
        const lockedUntil = newCount >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_SECONDS * 1000 : null;
        saveAttemptRecord({ count: newCount, lockedUntil });
        if (lockedUntil) {
          setLockoutRemaining(LOCKOUT_SECONDS);
          setError(`Too many attempts. Locked for ${LOCKOUT_SECONDS}s.`);
        } else {
          setError(`Invalid PIN (${MAX_ATTEMPTS - newCount} attempt${MAX_ATTEMPTS - newCount === 1 ? '' : 's'} left)`);
        }
        setShake(true);
        setTimeout(() => setShake(false), 500);
        setPin('');
      }
    } catch {
      setError('Connection error. Try again.');
      setPin('');
    } finally {
      setLoading(false);
    }
  }, [loading, isLocked, login, onLoginSuccess]);

  // Keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isLocked || loading) return;
      if (e.key >= '0' && e.key <= '9') {
        setPin(p => p.length < 4 ? p + e.key : p);
      } else if (e.key === 'Backspace') {
        setPin(p => p.slice(0, -1));
        setError('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isLocked, loading]);

  // Auto-submit when 4 digits entered
  useEffect(() => {
    if (pin.length === 4) {
      void handleSubmit(pin);
    }
  }, [pin, handleSubmit]);

  return (
    <div className="h-screen flex bg-[#0B0E14]">
      {/* Left panel - Branding */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-[#161B22] p-12 border-r border-gray-800">
        <div className="flex items-center gap-4">
          <div className="size-12 rounded-2xl bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <UtensilsCrossed className="size-6 text-white" />
          </div>
          <div>
            <p className="font-black text-white text-2xl tracking-tighter uppercase italic leading-none">Alnawras</p>
            <p className="text-[10px] text-orange-500 font-bold uppercase tracking-[0.2em] mt-1">Smart POS System</p>
          </div>
        </div>
        
        <div>
          <h1 className="text-6xl font-black text-white leading-none tracking-tighter uppercase italic mb-6">
            Ready for<br />the shift?
          </h1>
          <p className="text-gray-500 text-xl font-medium">Enter your credentials to access the dashboard.</p>
        </div>
        
        <p className="text-gray-600 text-xs font-bold uppercase tracking-widest">© 2025 Alnawras Restaurant Group</p>
      </div>

      {/* Right panel - Keypad */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Mobile Logo */}
          <div className="lg:hidden flex flex-col items-center gap-3 mb-12">
            <div className="size-14 rounded-[22px] bg-orange-500 flex items-center justify-center shadow-xl">
              <UtensilsCrossed className="size-7 text-white" />
            </div>
            <p className="font-black text-white text-2xl uppercase italic tracking-tighter">Alnawras POS</p>
          </div>

          <div className="text-center lg:text-left mb-10">
            <h2 className="text-3xl font-black text-white tracking-tight uppercase italic">Staff Check-in</h2>
            <p className="text-gray-500 font-bold text-xs uppercase tracking-widest mt-2">Enter your 4-digit security PIN</p>
          </div>

          {/* PIN Display (Dots) */}
          <div className={`flex justify-center lg:justify-start gap-5 mb-10 ${shake ? 'animate-shake' : ''}`}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} className={`size-5 rounded-full border-2 transition-all duration-200 ${
                pin.length > i
                  ? 'bg-orange-500 border-orange-500 scale-125 shadow-lg shadow-orange-500/40'
                  : 'bg-transparent border-gray-700'
              }`} />
            ))}
          </div>

          {isLocked ? (
            <div className="bg-red-500/10 border border-red-500/20 py-4 rounded-xl mb-6 text-center animate-in fade-in">
              <p className="text-red-400 text-xs font-bold uppercase tracking-widest">Account locked</p>
              <p className="text-red-500 text-2xl font-black mt-1">{lockoutRemaining}s</p>
              <p className="text-red-400/60 text-[10px] mt-1">Too many failed attempts</p>
            </div>
          ) : error ? (
            <div className="bg-red-500/10 border border-red-500/20 py-3 rounded-xl mb-6 animate-in fade-in slide-in-from-top-2">
              <p className="text-center text-red-500 text-xs font-bold uppercase tracking-widest">{error}</p>
            </div>
          ) : null}

          {/* Keypad Grid */}
          <div className="grid grid-cols-3 gap-4 mb-10">
            {[1,2,3,4,5,6,7,8,9].map(n => (
              <button
                key={n}
                onClick={() => { if (!isLocked && pin.length < 4) setPin(p => p + n); }}
                disabled={loading || isLocked}
                className="h-20 rounded-[24px] bg-gray-800/40 text-white text-2xl font-black hover:bg-gray-800 hover:scale-105 active:scale-95 transition-all border border-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label={`Digit ${n}`}
              >
                {n}
              </button>
            ))}
            <button
              onClick={() => { setPin(p => p.slice(0, -1)); setError(''); }}
              disabled={loading || pin.length === 0 || isLocked}
              className="h-20 rounded-[24px] bg-gray-800/20 text-gray-500 text-xl flex items-center justify-center hover:text-white transition-colors disabled:opacity-30"
              aria-label="Backspace"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path><line x1="18" y1="9" x2="12" y2="15"></line><line x1="12" y1="9" x2="18" y2="15"></line></svg>
            </button>
            <button
              onClick={() => { if (!isLocked && pin.length < 4) setPin(p => p + '0'); }}
              disabled={loading || isLocked}
              className="h-20 rounded-[24px] bg-gray-800/40 text-white text-2xl font-black hover:bg-gray-800 hover:scale-105 transition-all border border-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Digit 0"
            >
              0
            </button>
            <button
              onClick={() => void handleSubmit(pin)}
              disabled={loading || pin.length !== 4 || isLocked}
              className="h-20 rounded-[24px] bg-orange-500 text-white shadow-xl shadow-orange-500/20 hover:bg-orange-600 active:scale-95 transition-all flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Submit PIN"
            >
              {loading
                ? <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin" />
                : <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
}
