import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { DeviceAuthController } from '../controllers/DeviceAuthController';

interface DeviceAuthContextType {
  /** True while the initial device-session check is in flight. */
  loading: boolean;
  /** True once >=1 branch device account exists — i.e. the gate is switched on.
   *  When false the whole layer is dormant and the app behaves as PIN-only. */
  deviceGateRequired: boolean;
  /** True when a valid branch device session is present on this device. */
  deviceUnlocked: boolean;
  /** The branch id this device is bound to (null if not unlocked). */
  deviceBranchId: string | null;
  signInDevice: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signOutDevice: () => Promise<void>;
}

const DeviceAuthContext = createContext<DeviceAuthContextType | undefined>(undefined);

export function DeviceAuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [deviceGateRequired, setDeviceGateRequired] = useState(false);
  const [deviceBranchId, setDeviceBranchId] = useState<string | null>(null);

  // Re-derive both facts: (a) is the gate switched on at all, and (b) does this
  // device currently hold a valid branch session. Runs on load and on any auth
  // state change (sign-in/out here, token refresh, or a sign-out in another tab).
  const evaluate = useCallback(async () => {
    const [required, branchId] = await Promise.all([
      DeviceAuthController.isRequired(),
      DeviceAuthController.getDeviceBranch(),
    ]);
    setDeviceGateRequired(required);
    setDeviceBranchId(branchId);
    setLoading(false);
  }, []);

  useEffect(() => {
    void evaluate();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { void evaluate(); });
    return () => sub.subscription.unsubscribe();
  }, [evaluate]);

  const signInDevice = useCallback(async (email: string, password: string) => {
    const res = await DeviceAuthController.signIn(email, password);
    if (res.success) await evaluate();
    return res;
  }, [evaluate]);

  const signOutDevice = useCallback(async () => {
    await DeviceAuthController.signOut();
    await evaluate();
  }, [evaluate]);

  const value: DeviceAuthContextType = {
    loading,
    deviceGateRequired,
    deviceUnlocked: !!deviceBranchId,
    deviceBranchId,
    signInDevice,
    signOutDevice,
  };

  return <DeviceAuthContext.Provider value={value}>{children}</DeviceAuthContext.Provider>;
}

export function useDeviceAuth(): DeviceAuthContextType {
  const ctx = useContext(DeviceAuthContext);
  if (!ctx) throw new Error('useDeviceAuth must be used within DeviceAuthProvider');
  return ctx;
}
