import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { DeviceAuthController } from '../controllers/DeviceAuthController';

interface DeviceAuthContextType {
  /** True while the initial session check is in flight. */
  loading: boolean;
  /** True once >=1 branch device account exists (used by the installed app only). */
  deviceGateRequired: boolean;
  /** True when a valid branch session is present on this device. */
  deviceUnlocked: boolean;
  /** The branch id this device is bound to (null if not unlocked). */
  deviceBranchId: string | null;
  /** True when the current session belongs to a super-admin. */
  isSuperAdmin: boolean;
  signInDevice: (email: string, password: string) => Promise<{ success: boolean; role?: 'superadmin' | 'branch'; error?: string }>;
  signOutDevice: () => Promise<void>;
}

const DeviceAuthContext = createContext<DeviceAuthContextType | undefined>(undefined);

export function DeviceAuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [deviceGateRequired, setDeviceGateRequired] = useState(false);
  const [deviceBranchId, setDeviceBranchId] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Re-derive session facts on load and on any auth change (sign-in/out here,
  // token refresh, or a sign-out in another tab). Skips the per-session RPCs
  // when there's no session (customer / logged-out) to keep public pages light.
  const evaluate = useCallback(async () => {
    const required = await DeviceAuthController.isRequired();
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) {
      setDeviceGateRequired(required);
      setDeviceBranchId(null);
      setIsSuperAdmin(false);
      setLoading(false);
      return;
    }
    const [branchId, saRes] = await Promise.all([
      DeviceAuthController.getDeviceBranch(),
      supabase.rpc('is_current_user_super_admin'),
    ]);
    setDeviceGateRequired(required);
    setDeviceBranchId(branchId);
    setIsSuperAdmin(saRes.data === true);
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
    isSuperAdmin,
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
