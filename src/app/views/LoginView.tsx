import { useState, useEffect } from 'react';
import { usePOS } from '../context/POSContext';
import { UtensilsCrossed } from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess: () => void;
}

export function LoginView({ onLoginSuccess }: LoginViewProps) {
  const { login } = usePOS();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') setPin(p => p.length < 4 ? p + e.key : p);
      else if (e.key === 'Backspace') { setPin(p => p.slice(0, -1)); setError(''); }
      else if (e.key === 'Enter' && pin.length === 4) handleSubmit();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pin]);

  useEffect(() => {
    if (pin.length === 4) handleSubmit();
  }, [pin]);

  const handleSubmit = async () => {
    if (pin.length !== 4 || loading) return;
    setLoading(true);
    setError('');
    const result = await login(pin);
    if (result.success) {
      onLoginSuccess();
    } else {
      setError(result.error || 'Invalid PIN');
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setPin('');
    }
    setLoading(false);
  };

  const pad = (d: string) => (d.length < 2 ? '0' + d : d);
  const roles = [
    { label: 'Admin', pin: '1234', color: 'bg-violet-100 text-violet-700' },
    { label: 'Cashier', pin: '2345', color: 'bg-blue-100 text-blue-700' },
    { label: 'Waiter', pin: '3456', color: 'bg-emerald-100 text-emerald-700' },
  ];

  return (
    <div className="h-screen flex bg-gray-950">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-gray-900 p-12">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-amber-500 flex items-center justify-center">
            <UtensilsCrossed className="size-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-lg leading-tight">Alnawras</p>
            <p className="text-[11px] text-gray-400 uppercase tracking-wider">Point of Sale</p>
          </div>
        </div>
        <div>
          <h1 className="text-5xl font-bold text-white leading-tight mb-4">
            Welcome<br />back.
          </h1>
          <p className="text-gray-400 text-lg">Sign in to start your shift.</p>
        </div>
        <p className="text-gray-600 text-sm">© 2025 Alnawras Restaurant</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 justify-center mb-10">
            <div className="size-10 rounded-xl bg-amber-500 flex items-center justify-center">
              <UtensilsCrossed className="size-5 text-white" />
            </div>
            <p className="font-bold text-white text-xl">Alnawras POS</p>
          </div>

          <h2 className="text-2xl font-bold text-white mb-1">Enter your PIN</h2>
          <p className="text-gray-400 mb-8 text-sm">Use the keypad or your keyboard</p>

          {/* PIN dots */}
          <div className={`flex justify-center gap-4 mb-6 transition-transform ${shake ? 'animate-[shake_0.4s_ease]' : ''}`}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} className={`size-4 rounded-full transition-all duration-150 ${
                pin.length > i
                  ? 'bg-amber-400 scale-110'
                  : 'bg-gray-700'
              }`} />
            ))}
          </div>

          {error && (
            <p className="text-center text-red-400 text-sm mb-4">{error}</p>
          )}

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[1,2,3,4,5,6,7,8,9].map(n => (
              <button
                key={n}
                onClick={() => { if (pin.length < 4) setPin(p => p + n); }}
                disabled={loading}
                className="h-14 rounded-xl bg-gray-800 text-white text-xl font-medium hover:bg-gray-700 active:scale-95 transition-all disabled:opacity-50"
              >
                {n}
              </button>
            ))}
            <button
              onClick={() => { setPin(p => p.slice(0, -1)); setError(''); }}
              disabled={loading || pin.length === 0}
              className="h-14 rounded-xl bg-gray-800 text-gray-400 text-lg hover:bg-gray-700 active:scale-95 transition-all disabled:opacity-50"
            >
              ⌫
            </button>
            <button
              onClick={() => { if (pin.length < 4) setPin(p => p + '0'); }}
              disabled={loading}
              className="h-14 rounded-xl bg-gray-800 text-white text-xl font-medium hover:bg-gray-700 active:scale-95 transition-all disabled:opacity-50"
            >
              0
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || pin.length !== 4}
              className="h-14 rounded-xl bg-amber-500 text-white text-lg font-semibold hover:bg-amber-400 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading
                ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : '→'}
            </button>
          </div>

          {/* Demo pills */}
          <div className="border-t border-gray-800 pt-5">
            <p className="text-xs text-gray-500 text-center mb-3">Demo PINs</p>
            <div className="flex justify-center gap-2">
              {roles.map(r => (
                <button
                  key={r.label}
                  onClick={() => setPin(r.pin)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${r.color} transition-opacity hover:opacity-80`}
                >
                  {r.label}: {r.pin}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
