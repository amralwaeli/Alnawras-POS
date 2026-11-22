import { useState } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { useDeviceAuth } from '../../context/DeviceAuthContext';
import { isNativeApp } from '../../../lib/platform';
import { friendlyError } from '../../../lib/errors';
import { getSavedServer, parseSetupCode, switchServer } from '../../../lib/serverConfig';

/**
 * DeviceLoginView — the branch email+password gate.
 *
 * On the WEBSITE this is the tenant admin sign-in: on success App.tsx logs
 * straight in as admin (no PIN pad). In the installed APP it binds the device
 * to the branch account, after which staff sign in with their PIN. Same screen,
 * platform-aware wording. Styled to match the staff PIN screen (LoginView).
 */
export function DeviceLoginView() {
  const { signInDevice } = useDeviceAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const native = isNativeApp();
  const own = getSavedServer();
  const [showSetup, setShowSetup] = useState(false);
  const [setupCode, setSetupCode] = useState('');
  const [setupError, setSetupError] = useState('');

  // One-time customers: point this device at their own server, then start again on it.
  const connect = (code: string | null) => {
    const cfg = code === null ? null : parseSetupCode(code);
    if (code !== null && !cfg) { setSetupError('That setup code is not valid. Copy it again from the setup message.'); return; }
    const res = switchServer(cfg);
    if (!res.ok) { setSetupError(res.error ?? 'Could not change the server.'); return; }
    window.location.reload();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password || loading) return;
    setLoading(true);
    setError('');
    const res = await signInDevice(email, password);
    setLoading(false);
    if (!res.success) setError(friendlyError(res.error, 'Sign-in failed'));
    // On success the gate re-evaluates: the app swaps to the staff PIN pad, the
    // website logs straight in as the tenant admin.
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[#0B0E14] p-4 sm:p-6">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex flex-col items-center mb-6 sm:mb-10">
          <img src={`${import.meta.env.BASE_URL}smartpos-icon.svg`} alt="" className="size-14 rounded-[22px] shadow-xl shadow-orange-500/20 mb-4" />
          <p className="font-black text-white text-2xl tracking-tight">Smart<span className="text-orange-500">Pos</span></p>
          <p className="text-[10px] text-orange-500 font-bold uppercase tracking-[0.2em] mt-1">
            {native ? 'Device Sign-in' : 'Sign in'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#161B22] border border-gray-800 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="text-center mb-2">
            <h2 className="text-lg font-black text-white tracking-tight uppercase italic">
              {native ? 'Sign this device in' : 'Sign in'}
            </h2>
            <p className="text-gray-500 text-xs font-medium mt-1">
              {native
                ? 'Use the branch email & password from your administrator.'
                : 'Use your branch email & password.'}
            </p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <p className="text-center text-red-400 text-xs font-bold uppercase tracking-wider break-words">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-widest">Email</label>
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
            {native ? 'Unlock Device' : 'Sign In'}
          </button>

          <p className="flex items-center justify-center gap-1.5 text-[11px] text-gray-600 pt-1">
            <Lock className="size-3" />
            {native
              ? 'Stays signed in until an administrator signs this device out.'
              : 'Signed in for this tab only — closing it signs you out.'}
          </p>
        </form>

        <div className="mt-4 text-center">
          {own ? (
            <p className="text-[11px] text-gray-500">
              Own server: {own.url.replace('https://', '').split('.')[0]}{' · '}
              <button type="button" onClick={() => connect(null)} className="underline hover:text-gray-300">use the SmartPos server</button>
            </p>
          ) : !showSetup ? (
            <button type="button" onClick={() => setShowSetup(true)} className="text-[11px] text-gray-500 underline hover:text-gray-300 min-h-10">
              Bought SmartPos once? Connect to your own server
            </button>
          ) : (
            <div className="bg-[#161B22] border border-gray-800 rounded-2xl p-4 space-y-3 text-left">
              <label htmlFor="setup-code" className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Setup code</label>
              <textarea id="setup-code" rows={3} value={setupCode} onChange={e => { setSetupCode(e.target.value); setSetupError(''); }}
                placeholder="Paste the setup code you were given"
                className="w-full px-3 py-2 bg-gray-800/40 border border-gray-800 rounded-xl text-white text-xs font-mono break-all focus:outline-none focus:border-orange-500" />
              {setupError && <p className="text-red-400 text-xs">{setupError}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowSetup(false)} className="flex-1 min-h-11 rounded-xl border border-gray-700 text-gray-300 text-sm">Cancel</button>
                <button type="button" disabled={!setupCode.trim()} onClick={() => connect(setupCode)} className="flex-1 min-h-11 rounded-xl bg-orange-500 text-white text-sm font-bold disabled:opacity-50">Connect</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
