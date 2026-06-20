import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router';
import { POSProvider, usePOS } from './context/POSContext';
import { router } from './routes';
import { LoginView } from './modules/auth';
import { checkSupabaseConnection } from '../lib/supabase';

// Routes that customers reach via QR code scan or a pickup link — no staff login required.
const PUBLIC_HASH_PREFIXES = ['#/table/', '#/order/', '#/pickup/'];

function isPublicRoute(): boolean {
  return PUBLIC_HASH_PREFIXES.some(prefix => window.location.hash.startsWith(prefix));
}

function AppContent() {
  const { currentUser, authLoading } = usePOS();

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

  return <RouterProvider router={router} />;
}

export default function App() {
  const [supabaseOk, setSupabaseOk] = useState<boolean | null>(null);

  useEffect(() => {
    checkSupabaseConnection().then(setSupabaseOk);
  }, []);

  return (
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
  );
}
