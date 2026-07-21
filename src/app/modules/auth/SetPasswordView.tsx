import { useState, ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { UtensilsCrossed, Lock, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

/** Public page reached from a tenant invite email (/#/set-password?token=...).
 *  The token is validated by the set-tenant-password Edge Function, which sets
 *  the account password. No login required — the token is the credential. */
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0E14] p-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <div className="size-14 rounded-[22px] bg-orange-500 flex items-center justify-center shadow-xl shadow-orange-500/20 mb-4">
            <UtensilsCrossed className="size-7 text-white" />
          </div>
          <p className="font-black text-white text-2xl uppercase italic tracking-tighter">Alnawras POS</p>
          <p className="text-[10px] text-orange-500 font-bold uppercase tracking-[0.2em] mt-1">Set Your Password</p>
        </div>
        {children}
      </div>
    </div>
  );
}

export function SetPasswordView() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true); setError('');

    const { data, error: invErr } = await supabase.functions.invoke('set-tenant-password', { body: { token, password } });
    // Edge Functions return the error body on a non-2xx status via error.context.
    let payload: any = data;
    if (invErr && (invErr as any).context instanceof Response) {
      try { payload = await (invErr as any).context.json(); } catch { /* keep null */ }
    }
    setLoading(false);
    if (payload?.success) { setDone(true); return; }
    setError(payload?.error || invErr?.message || 'Could not set your password. The link may have expired.');
  };

  if (!token) {
    return (
      <Shell>
        <div className="bg-[#161B22] border border-gray-800 rounded-2xl p-6 text-center">
          <XCircle className="size-8 text-red-400 mx-auto mb-3" />
          <p className="text-sm text-gray-300">This link is missing its token. Please open the link from your invite email.</p>
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div className="bg-[#161B22] border border-gray-800 rounded-2xl p-6 text-center space-y-4">
          <CheckCircle2 className="size-10 text-emerald-400 mx-auto" />
          <p className="text-sm text-gray-200">Your password is set. You can now sign in with your email and new password.</p>
          <button onClick={() => { window.location.hash = '#/'; }}
            className="w-full py-3 bg-orange-500 text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-orange-600 transition-colors">
            Go to sign in
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={submit} className="bg-[#161B22] border border-gray-800 rounded-2xl p-6 space-y-4">
        <p className="text-center text-gray-500 text-xs font-medium">Choose a password for your account.</p>
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <p className="text-center text-red-400 text-xs font-bold uppercase tracking-wider">{error}</p>
          </div>
        )}
        <div>
          <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-widest">New Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoFocus autoComplete="new-password"
            className="w-full px-4 py-3 bg-gray-800/40 border border-gray-800 rounded-xl text-white text-sm focus:outline-none focus:border-orange-500 transition-colors" placeholder="••••••••" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-widest">Confirm Password</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password"
            className="w-full px-4 py-3 bg-gray-800/40 border border-gray-800 rounded-xl text-white text-sm focus:outline-none focus:border-orange-500 transition-colors" placeholder="••••••••" />
        </div>
        <button type="submit" disabled={loading || !password || !confirm}
          className="w-full py-3 bg-orange-500 text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-orange-600 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />} Set Password
        </button>
      </form>
    </Shell>
  );
}
