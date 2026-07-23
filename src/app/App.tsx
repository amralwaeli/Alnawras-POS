import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router';
import { POSProvider, usePOS } from './context/POSContext';
import { DeviceAuthProvider, useDeviceAuth } from './context/DeviceAuthContext';
import { router } from './routes';
import { LoginView, DeviceLoginView } from './modules/auth';
import { AlertOverlay } from './components/AlertOverlay';
import { checkSupabaseConnection } from '../lib/supabase';
import { isNativeApp } from '../lib/platform';
import { User } from './models/types';

// Routes that bypass the staff PIN login: customer QR/pickup pages, and the
// super-admin panel (which uses its own separate Supabase Auth login).
const PUBLIC_HASH_PREFIXES = ['#/table/', '#/order/', '#/pickup/', '#/superadmin', '#/set-password'];

function isPublicRoute(): boolean {
  return PUBLIC_HASH_PREFIXES.some(prefix => window.location.hash.startsWith(prefix));
}

/** On the website, the branch email+password IS the tenant's admin login, so a
 *  successful device sign-in becomes an admin session directly (no PIN pad). */
function makeDeviceAdmin(branchId: string): User {
  return {
    id: `web-admin-${branchId}`,
    name: 'Administrator',
    employmentNumber: '',
    role: 'admin',
    pin: '',
    email: '',
    status: 'active',
    branchId,
    createdAt: new Date(),
  };
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
  const { currentUser, authLoading, setCurrentUser } = usePOS();
  const { loading: deviceLoading, deviceGateRequired, deviceUnlocked, deviceBranchId, isSuperAdmin } = useDeviceAuth();
  const [, bumpOnHashChange] = useState(0);

  // Re-render on hash changes so a programmatic redirect (e.g. to the super-admin
  // panel below) re-evaluates the public-route check.
  useEffect(() => {
    const onHash = () => bumpOnHashChange(n => n + 1);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // WEB: the branch email+password is the tenant admin — once the branch session
  // is present, log straight in as admin (the website never shows the PIN pad).
  useEffect(() => {
    if (isNativeApp()) return;
    if (currentUser || !deviceUnlocked || !deviceBranchId) return;
    setCurrentUser(makeDeviceAdmin(deviceBranchId));
  }, [currentUser, deviceUnlocked, deviceBranchId, setCurrentUser]);

  // A signed-in super-admin belongs in the super-admin panel — send them there
  // from wherever they land (they log in from the same email+password screen).
  useEffect(() => {
    if (isSuperAdmin && !isPublicRoute()) window.location.hash = '#/superadmin';
  }, [isSuperAdmin]);

  const publicRoute = isPublicRoute();

  // While auth is initializing, show a neutral loader (prevents a login flash
  // when a customer scans a QR).
  if (authLoading) return <NeutralLoader />;

  // Customer QR/pickup pages, the super-admin panel, and set-password bypass the
  // staff gates entirely.
  if (!publicRoute) {
    if (deviceLoading) return <NeutralLoader />;

    // A super-admin session is being redirected to the panel (effect above).
    if (isSuperAdmin) return <NeutralLoader />;

    if (!isNativeApp()) {
      // WEBSITE: email + password is the default front door — no PIN here, and
      // it's always shown until a branch session exists (super-admins log in here too).
      if (!deviceUnlocked) return <DeviceLoginView />;
      if (!currentUser) return <NeutralLoader />; // the web-admin effect is signing in
    } else {
      // INSTALLED APP: branch email+password (dormant until provisioned) then PIN.
      if (deviceGateRequired && !deviceUnlocked) return <DeviceLoginView />;
      if (!currentUser) return <LoginView onLoginSuccess={() => {}} />;
    }
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
