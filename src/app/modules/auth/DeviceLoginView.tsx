import { useState } from 'react';
import { UtensilsCrossed, Lock, Loader2 } from 'lucide-react';
import { useDeviceAuth } from '../../context/DeviceAuthContext';

/**
 * DeviceLoginView — the branch email+password gate shown before the staff PIN
 * pad. A device signs in here once; it then stays bound to the branch account
 * (staff just PIN in) until an admin signs the device out. Rendered by App.tsx
 * only when the gate is active (a branch device account exists) and this device
 * isn't already unlocked. Styled to match the staff PIN screen (LoginView).
 */
export function DeviceLoginView() {
  const { signInDevice } = useDeviceAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password || loading) return;
    setLoading(true);
    setError('');
    const res = await signInDevice(email, password);
    setLoading(false);
    if (!res.success) setError(res.error || 'Sign-in failed');
    // On success the gate re-evaluates and App.tsx swaps to the staff PIN pad.
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0E14] p-6">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex flex-col items-center mb-10">
          <div className="size-14 rounded-[22px] bg-orange-500 flex items-center justify-center shadow-xl shadow-orange-500/20 mb-4">
            <UtensilsCrossed className="size-7 text-white" />
          </div>
          <p className="font-black text-white text-2xl uppercase italic tracking-tighter">Alnawras POS</p>
          <p className="text-[10px] text-orange-500 font-bold uppercase tracking-[0.2em] mt-1">Device Sign-in</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#161B22] border border-gray-800 rounded-2xl p-6 space-y-4">
          <div className="text-center mb-2">
            <h2 className="text-lg font-black text-white tracking-tight uppercase italic">Sign this device in</h2>
            <p className="text-gray-500 text-xs font-medium mt-1">Use the branch email &amp; password from your administrator.</p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <p className="text-center text-red-400 text-xs font-bold uppercase tracking-wider">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-widest">Branch Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus autoComplete="username"
              className="w-full px-4 py-3 bg-gray-800/40 border border-gray-800 rounded-xl text-white text-sm focus:outline-none focus:border-orange-500 transition-colors"
              placeholder="branch@example.com"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-widest">Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password"
              className="w-full px-4 py-3 bg-gray-800/40 border border-gray-800 rounded-xl text-white text-sm focus:outline-none focus:border-orange-500 transition-colors"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit" disabled={loading || !email.trim() || !password}
            className="w-full py-3 bg-orange-500 text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-orange-600 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
            Unlock Device
          </button>

          <p className="flex items-center justify-center gap-1.5 text-[11px] text-gray-600 pt-1">
            <Lock className="size-3" />
            Stays signed in until an administrator signs this device out.
          </p>
        </form>
      </div>
    </div>
  );
}
