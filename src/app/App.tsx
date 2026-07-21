import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router';
import { POSProvider, usePOS } from './context/POSContext';
import { DeviceAuthProvider, useDeviceAuth } from './context/DeviceAuthContext';
import { router } from './routes';
import { LoginView, DeviceLoginView } from './modules/auth';
import { AlertOverlay } from './components/AlertOverlay';
import { checkSupabaseConnection } from '../lib/supabase';

// Routes that bypass the staff PIN login: customer QR/pickup pages, and the
// super-admin panel (which uses its own separate Supabase Auth login).
const PUBLIC_HASH_PREFIXES = ['#/table/', '#/order/', '#/pickup/', '#/superadmin'];

function isPublicRoute(): boolean {
  return PUBLIC_HASH_PREFIXES.some(prefix => window.location.hash.startsWith(prefix));
}

function NeutralLoader() {
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

function AppContent() {
  const { currentUser, authLoading } = usePOS();
  const { loading: deviceLoading, deviceGateRequired, deviceUnlocked } = useDeviceAuth();

  const publicRoute = isPublicRoute();

  // While auth is initializing (fetching the staff list), show a neutral
  // loading screen — prevents the PIN pad flashing when a customer scans a QR.
  if (authLoading) return <NeutralLoader />;

  // Customer QR/pickup pages and the super-admin panel bypass every staff gate.
  if (!publicRoute) {
    // Still resolving whether this device is signed into a branch account.
    if (deviceLoading) return <NeutralLoader />;

    // 1) DEVICE GATE — branch email+password, sits above the staff PIN. Stays
    //    dormant (skipped) until a branch device account is provisioned (0024),
    //    so deploying this never locks anyone out.
    if (deviceGateRequired && !deviceUnlocked) return <DeviceLoginView />;

    // 2) STAFF PIN — unchanged.
    if (!currentUser) return <LoginView onLoginSuccess={() => {}} />;
  }

  return <RouterProvider router={router} />;
}

export default function App() {
  const [supabaseOk, setSupabaseOk] = useState<boolean | null>(null);

  useEffect(() => {
    checkSupabaseConnection().then(setSupabaseOk);
  }, []);

  return (
    <DeviceAuthProvider>
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
        <AlertOverlay />
      </POSProvider>
    </DeviceAuthProvider>
  );
}
