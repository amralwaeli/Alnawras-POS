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
  const { loading: deviceLoading, deviceGateRequired, deviceUnlocked, deviceBranchId } = useDeviceAuth();

  // WEB ONLY: the branch email+password is the tenant admin. Once the device is
  // unlocked, log straight in as admin — the website never shows the PIN pad.
  // The installed app skips this and asks staff for their PIN instead.
  useEffect(() => {
    if (isNativeApp()) return;
    if (currentUser || !deviceUnlocked || !deviceBranchId) return;
    setCurrentUser(makeDeviceAdmin(deviceBranchId));
  }, [currentUser, deviceUnlocked, deviceBranchId, setCurrentUser]);

  const publicRoute = isPublicRoute();

  // While auth is initializing (fetching the staff list), show a neutral
  // loading screen — prevents the PIN pad flashing when a customer scans a QR.
  if (authLoading) return <NeutralLoader />;

  // Customer QR/pickup pages and the super-admin panel bypass every staff gate.
  if (!publicRoute) {
    // Still resolving whether this device is signed into a branch account.
    if (deviceLoading) return <NeutralLoader />;

    // 1) DEVICE / TENANT GATE — branch email+password, on both web and app.
    //    Dormant (skipped) until a branch account is provisioned (0024), so
    //    deploying never locks anyone out.
    if (deviceGateRequired && !deviceUnlocked) return <DeviceLoginView />;

    // 2a) WEB: device unlocked but the admin session hasn't been set yet — show
    //     the loader for the one tick the effect above needs to log in as admin,
    //     never the PIN pad.
    if (!currentUser && !isNativeApp() && deviceGateRequired && deviceUnlocked) {
      return <NeutralLoader />;
    }

    // 2b) APP: after the device is bound, staff sign in with their PIN.
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
