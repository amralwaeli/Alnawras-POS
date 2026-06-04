import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../models/types';
import { AuthController } from '../controllers/AuthController';
import { StaffController } from '../controllers/StaffController';
import { clearAuthSession, loadAuthSession, saveAuthSession } from '../../lib/authSession';

interface AuthContextType {
  currentUser: User | null;
  authLoading: boolean;
  users: User[];
  setCurrentUser: (u: User | null) => void;
  setUsers: (u: User[]) => void;
  login: (pin: string) => Promise<{ success: boolean; user?: User; error?: string }>;
  changePin: (currentPin: string, newPin: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  addUser: (u: any) => Promise<any>;
  updateUser: (id: string, up: any) => Promise<any>;
  deleteUser: (id: string) => Promise<any>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children, onLogout }: { children: ReactNode; onLogout?: () => void }) {
  const [currentUser, setCurrentUserState] = useState<User | null>(() => loadAuthSession()?.user ?? null);
  const [users, setUsers] = useState<User[]>([]);
  // authLoading stays true until the initial user list is fetched from Supabase.
  // While true, App.tsx shows a neutral spinner instead of the login screen,
  // preventing a flash of the PIN pad on QR / public routes.
  const [authLoading, setAuthLoading] = useState(true);

  const setCurrentUser = (u: User | null) => {
    const existing = loadAuthSession();
    if (u && existing) saveAuthSession({ ...existing, user: u });
    if (!u) clearAuthSession();
    setCurrentUserState(u);
  };

  useEffect(() => {
    StaffController.getStaff().then(res => {
      if (res.success && res.data) {
        setUsers(res.data);
        // Validate the restored session user still exists and is active
        const sessionUser = loadAuthSession()?.user;
        if (sessionUser) {
          const stillValid = res.data.find(u => u.id === sessionUser.id && u.status === 'active');
          if (!stillValid) {
            // Session is stale (user deactivated or deleted)
            setCurrentUser(null);
          }
        }
      }
    }).finally(() => {
      setAuthLoading(false);
    });
  }, []);

  const login = async (pin: string) => {
    const result = await AuthController.authenticate(pin);
    if (result.success) setCurrentUser(result.user!);
    return result;
  };

  const changePin = async (currentPin: string, newPin: string) => {
    const result = await AuthController.changePin(currentPin, newPin);
    if (result.success && currentUser) setCurrentUser({ ...currentUser, pinMustChange: false });
    return result;
  };

  const logout = () => {
    clearAuthSession();
    setCurrentUserState(null);
    onLogout?.();
  };

  const addUser = async (u: any) => {
    const res = await StaffController.addStaff(u);
    if (res.success && res.data) setUsers(prev => [...prev, res.data!]);
    return res;
  };

  const updateUser = async (id: string, up: any) => {
    const res = await StaffController.updateStaff(id, up);
    if (res.success && res.data) setUsers(prev => prev.map(u => u.id === id ? res.data! : u));
    return res;
  };
  const deleteUser = async (id: string) => {
    const res = await StaffController.deleteStaff(id);
    if (res.success) setUsers(prev => prev.filter(u => u.id !== id));
    return res;
  };

  return (
    <AuthContext.Provider value={{
      currentUser, authLoading, users, setCurrentUser, setUsers,
      login, changePin, logout, addUser, updateUser, deleteUser,
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
