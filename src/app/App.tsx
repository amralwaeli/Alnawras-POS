import { useEffect, useState, Component, ReactNode } from 'react';
import { RouterProvider } from 'react-router';
import { POSProvider, usePOS } from './context/POSContext';
import { router } from './routes';
import { LoginView } from './modules/auth';
import { checkSupabaseConnection } from '../lib/supabase';

// ── Global error boundary ─────────────────────────────────────────────────────
interface EBState { hasError: boolean; message: string; }
class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { hasError: false, message: '' };
  static getDerivedStateFromError(err: Error): EBState {
    return { hasError: true, message: err?.message ?? 'Unknown error' };
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0B0E14', flexDirection: 'column', gap: 16, padding: 24 }}>
        <div style={{ background: '#1e1e2e', border: '1px solid #3f3f5a', borderRadius: 16, padding: '32px 40px', maxWidth: 480, textAlign: 'center' }}>
          <p style={{ color: '#f87171', fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Something went wrong</p>
          <p style={{ color: '#64748b', fontSize: 12, marginBottom: 24 }}>{this.state.message}</p>
          <button
            onClick={() => window.location.reload()}
            style={{ background: '#f59e0b', color: '#0B0E14', border: 'none', borderRadius: 10, padding: '10px 24px', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
          >
            Reload App
          </button>
        </div>
      </div>
    );
  }
}

// Routes that customers reach via QR code scan — no staff login required.
const PUBLIC_HASH_PREFIXES = ['#/table/', '#/order/'];

function isPublicRoute(): boolean {
  return PUBLIC_HASH_PREFIXES.some(prefix => window.location.hash.startsWith(prefix));
}

function AppContent() {
  const { currentUser, authLoading, changePin, logout } = usePOS() as any;
  const [pinForm, setPinForm] = useState({ current: '', next: '', confirm: '' });
  const [pinError, setPinError] = useState('');
  const [savingPin, setSavingPin] = useState(false);


  // While auth is initializing (fetching staff list from Supabase), show a
  // neutral loading screen. This prevents the PIN pad from flashing on screen
  // for a moment when a customer scans a QR code.
  if (authLoading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#f8fafc',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40, height: 40, border: '3px solid #f59e0b',
            borderTopColor: 'transparent', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ color: '#64748b', fontSize: 14, fontWeight: 600 }}>Loading…</p>
        </div>
      </div>
    );
  }

  // If no staff is logged in AND this is not a public QR/customer route,
  // show the staff PIN login screen.
  if (!currentUser && !isPublicRoute()) return <LoginView onLoginSuccess={() => {}} />;

  if (currentUser?.pinMustChange && !isPublicRoute()) {
    const submit = async () => {
      setPinError('');
      if (!/^\d{4}$/.test(pinForm.next)) {
        setPinError('New PIN must be exactly 4 digits.');
        return;
      }
      if (pinForm.next !== pinForm.confirm) {
        setPinError('PIN confirmation does not match.');
        return;
      }
      setSavingPin(true);
      const res = await changePin(pinForm.current, pinForm.next);
      setSavingPin(false);
      if (!res.success) setPinError(res.error || 'Failed to change PIN.');
    };

    return (
      <div className="min-h-screen bg-[#0B0E14] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Change PIN</h1>
          <p className="text-sm text-gray-500 mb-5">Set a secure PIN before continuing.</p>
          {pinError && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{pinError}</div>}
          <div className="space-y-3">
            <input type="password" inputMode="numeric" placeholder="Current PIN" value={pinForm.current} onChange={e => setPinForm({ ...pinForm, current: e.target.value.replace(/\D/g, '').slice(0, 4) })} className="w-full px-4 py-3 rounded-xl border" />
            <input type="password" inputMode="numeric" placeholder="New PIN" value={pinForm.next} onChange={e => setPinForm({ ...pinForm, next: e.target.value.replace(/\D/g, '').slice(0, 4) })} className="w-full px-4 py-3 rounded-xl border" />
            <input type="password" inputMode="numeric" placeholder="Confirm new PIN" value={pinForm.confirm} onChange={e => setPinForm({ ...pinForm, confirm: e.target.value.replace(/\D/g, '').slice(0, 4) })} className="w-full px-4 py-3 rounded-xl border" />
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={logout} className="flex-1 py-3 rounded-xl border text-sm font-semibold">Logout</button>
            <button onClick={submit} disabled={savingPin} className="flex-1 py-3 rounded-xl bg-orange-500 text-white text-sm font-semibold disabled:opacity-50">{savingPin ? 'Saving...' : 'Save PIN'}</button>
          </div>
        </div>
      </div>
    );
  }

  return <RouterProvider router={router} />;
}

export default function App() {
  const [supabaseOk, setSupabaseOk] = useState<boolean | null>(null);

  useEffect(() => {
    checkSupabaseConnection().then(setSupabaseOk);
  }, []);

  return (
    <ErrorBoundary>
      <POSProvider>
        {supabaseOk === false && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
            background: '#f59e0b', color: '#1c1917', padding: '6px 16px',
            fontSize: '13px', textAlign: 'center',
          }}>
            ⚠️ Supabase connection failed — check your API key in .env and rebuild.
          </div>
        )}
        <AppContent />
      </POSProvider>
    </ErrorBoundary>
  );
}
