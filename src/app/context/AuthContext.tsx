import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../models/types';
import { AuthController } from '../controllers/AuthController';
import { StaffController } from '../controllers/StaffController';
import { mapStaff } from '../models/mappers';
import { supabase } from '../../lib/supabase';
import { DeviceService } from '../services/DeviceService';

interface AuthContextType {
  currentUser: User | null;
  authLoading: boolean;
  users: User[];
  setCurrentUser: (u: User | null) => void;
  setUsers: (u: User[]) => void;
  login: (pin: string) => Promise<{ success: boolean; user?: User; error?: string }>;
  logout: () => void;
  addUser: (u: any) => Promise<any>;
  updateUser: (id: string, up: any) => Promise<any>;
  deleteUser: (id: string) => Promise<any>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children, onLogout }: { children: ReactNode; onLogout?: () => void }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  // authLoading stays true until the initial user list is fetched from Supabase.
  // While true, App.tsx shows a neutral spinner instead of the login screen,
  // preventing a flash of the PIN pad on QR / public routes.
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    StaffController.getStaff().then(res => {
      if (res.success && res.data) setUsers(res.data);
    }).finally(() => {
      setAuthLoading(false);
    });
  }, []);

  const login = async (pin: string) => {
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return { success: false, error: 'PIN must be 4 digits' };
    }

    // Primary path: verify server-side so no PIN is ever sent to the client.
    // Requires migration 0004 (verify_staff_pin). If that RPC is not yet
    // present, fall back to the legacy in-memory compare so the app keeps
    // working — remove this fallback once 0004 is applied (see SECURITY.md).
    const { data, error } = await supabase.rpc('verify_staff_pin', { p_pin: pin });
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return { success: false, error: 'Invalid PIN or inactive account' };
      const user = mapStaff(row);
      
      // ── DEVICE ROLE LOCKING ───────────────────────────────────────────────
      // Secure the tablet and cashier devices: only accept waiter on tablets,
      // and only cashier/admin on the cashier device.
      // Admin always bypasses the lock so the owner can never lock themselves
      // out of a device (e.g. to re-assign its station binding).
      const station = DeviceService.getStationType();
      if (user.role !== 'admin') {
        if (station === 'waiter' && !['waiter', 'swaiter'].includes(user.role)) {
          return { success: false, error: 'This tablet is for Waiters only. Please use the Cashier station.' };
        }
        if (station === 'cashier' && !['cashier', 'manager', 'accounting'].includes(user.role)) {
          return { success: false, error: 'This station is for Cashiers only.' };
        }
      }
      // ─────────────────────────────────────────────────────────────────────

      setCurrentUser(user);
      return { success: true, user };
    }

    const result = AuthController.authenticate(pin, users);
    if (result.success && result.user) {
      const user = result.user;
      const station = DeviceService.getStationType();
      // Admin always bypasses the lock (see note above).
      if (user.role !== 'admin') {
        if (station === 'waiter' && !['waiter', 'swaiter'].includes(user.role)) {
          return { success: false, error: 'This tablet is for Waiters only.' };
        }
        if (station === 'cashier' && !['cashier', 'manager', 'accounting'].includes(user.role)) {
          return { success: false, error: 'This station is for Cashiers only.' };
        }
      }
      setCurrentUser(user);
    }
    return result;
  };

  const logout = () => {
    setCurrentUser(null);
    onLogout?.();
  };

  const addUser = async (u: any) => {
    const res = await StaffController.addStaff(u);
    if (res.success && res.data) setUsers(prev => [...prev, res.data!]);
    return res;
  };

  const updateUser = (id: string, up: any) => StaffController.updateStaff(id, up);
  const deleteUser = (id: string) => StaffController.deleteStaff(id);

  return (
    <AuthContext.Provider value={{
      currentUser, authLoading, users, setCurrentUser, setUsers,
      login, logout, addUser, updateUser, deleteUser,
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
