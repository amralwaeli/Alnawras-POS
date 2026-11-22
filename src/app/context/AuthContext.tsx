import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../models/types';
import { StaffController } from '../controllers/StaffController';
import { BranchController } from '../controllers/BranchController';
import { mapStaff } from '../models/mappers';
import { supabase } from '../../lib/supabase';
import { DeviceService } from '../services/DeviceService';
import { PrinterController } from '../controllers/PrinterController';
import { isNativeApp } from '../../lib/platform';
import { isNetworkError } from '../services/OfflineSyncEngine';
import { rememberOfflinePin, checkOfflinePin, pruneOfflinePins } from '../../lib/offlinePins';

/** Staff-facing message when a branch is locked out (contract lapsed or the
 *  super-admin suspended it). Kept generic — staff shouldn't see billing detail. */
function branchBlockedMessage(reason?: 'suspended' | 'expired' | 'not-found'): string {
  if (reason === 'expired') return 'This branch subscription has ended. Please contact the administrator.';
  if (reason === 'suspended') return 'This branch is currently suspended. Please contact the administrator.';
  return 'This branch is not available right now. Please contact the administrator.';
}

interface AuthContextType {
  currentUser: User | null;
  authLoading: boolean;
  users: User[];
  setCurrentUser: (u: User | null) => void;
  setUsers: (u: User[]) => void;
  login: (pin: string) => Promise<{ success: boolean; user?: User; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Device role locking: waiters only on waiter tablets, cashier roles only on the
 *  cashier device. Admin always passes, so the owner can never be locked out. */
function stationRefusal(user: User): string | null {
  if (user.role === 'admin') return null;
  const station = DeviceService.getStationType();
  if (station === 'waiter' && !['waiter', 'swaiter'].includes(user.role)) return 'This tablet is for Waiters only. Please use the Cashier station.';
  if (station === 'cashier' && !['cashier', 'manager', 'accounting'].includes(user.role)) return 'This station is for Cashiers only.';
  return null;
}

export function AuthProvider({ children, onLogout }: { children: ReactNode; onLogout?: () => void }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  // authLoading stays true until the initial user list is fetched from Supabase.
  // While true, App.tsx shows a neutral spinner instead of the login screen,
  // preventing a flash of the PIN pad on QR / public routes.
  const [authLoading] = useState(false); // nothing to fetch before login any more

  // The staff list is loaded only for a signed-in user (the API refuses it to anyone else).
  useEffect(() => {
    if (!currentUser) { setUsers([]); return; }
    StaffController.getStaff().then(res => {
      if (!res.success || !res.data) return;
      setUsers(res.data);
      // Staff no longer active can't keep signing in offline on this device.
      if (isNativeApp()) pruneOfflinePins(res.data.filter(u => u.status === 'active').map(u => u.id));
    });
  }, [currentUser?.id]);

  // The branch's shared printer list → this device's copy used for printing (works offline).
  // Also every 5 minutes and when the app comes back to the screen, so a printer changed on
  // another device is used here without signing out.
  useEffect(() => {
    const branchId = currentUser?.branchId;
    if (!branchId) return;
    const refresh = () => { if (document.visibilityState === 'visible') void PrinterController.load(branchId); };
    refresh();
    const timer = setInterval(refresh, 5 * 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [currentUser?.branchId]);

  const login = async (pin: string) => {
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return { success: false, error: 'PIN must be 4 digits' };
    }

    // No internet: the app signs in staff who signed in on this device before (lib/offlinePins).
    const offline = async () => {
      if (!isNativeApp()) return { success: false, error: 'No internet — PIN sign-in needs a connection.' };
      const res = await checkOfflinePin(pin);
      if (!res.user) return { success: false, error: res.error };
      const refused = stationRefusal(res.user);
      if (refused) return { success: false, error: refused };
      setCurrentUser(res.user);
      return { success: true, user: res.user };
    };
    if (!navigator.onLine) return offline();
    // Checked on the server, for this device's branch only (migration 0030).
    const { data, error } = await supabase.rpc('verify_staff_pin', { p_pin: pin, p_device: DeviceService.getDeviceId() });
    if (error && isNetworkError(error)) return offline();
    if (error) {
      // The server's messages are written for staff ("Too many wrong PINs…").
      return { success: false, error: error.message || 'Could not check the PIN. Try again.' };
    }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return { success: false, error: 'Invalid PIN or inactive account' };
      const user = mapStaff(row);

      // ── BRANCH CONTRACT / SUSPENSION LOCK ─────────────────────────────────
      // Block login the moment a branch's contract lapses or it's suspended by
      // the super-admin. Fails open if the branches registry isn't present yet
      // (single-tenant install pre-0018), so this can't break existing logins.
      const access = await BranchController.getAccess(user.branchId);
      if (!access.allowed) {
        return { success: false, error: branchBlockedMessage(access.reason) };
      }

      const refused = stationRefusal(user);
      if (refused) return { success: false, error: refused };

      if (isNativeApp()) rememberOfflinePin(pin, user).catch(() => { /* offline sign-in just won't be available */ });
      setCurrentUser(user);
      return { success: true, user };
  };

  const logout = () => {
    setCurrentUser(null);
    onLogout?.();
  };

  return (
    <AuthContext.Provider value={{
      currentUser, authLoading, users, setCurrentUser, setUsers,
      login, logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
