import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../models/types';
import { AuthController } from '../controllers/AuthController';
import { StaffController } from '../controllers/StaffController';

const SESSION_KEY = 'alnawras_session_user';

function loadSessionUser(): User | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Rehydrate Date fields
    if (parsed.createdAt) parsed.createdAt = new Date(parsed.createdAt);
    if (parsed.lastLogin) parsed.lastLogin = new Date(parsed.lastLogin);
    return parsed as User;
  } catch { return null; }
}

function saveSessionUser(user: User | null) {
  if (user) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } else {
    sessionStorage.removeItem(SESSION_KEY);
  }
}

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
  const [currentUser, setCurrentUserState] = useState<User | null>(loadSessionUser);
  const [users, setUsers] = useState<User[]>([]);
  // authLoading stays true until the initial user list is fetched from Supabase.
  // While true, App.tsx shows a neutral spinner instead of the login screen,
  // preventing a flash of the PIN pad on QR / public routes.
  const [authLoading, setAuthLoading] = useState(true);

  const setCurrentUser = (u: User | null) => {
    saveSessionUser(u);
    setCurrentUserState(u);
  };

  useEffect(() => {
    StaffController.getStaff().then(res => {
      if (res.success && res.data) {
        setUsers(res.data);
        // Validate the restored session user still exists and is active
        const sessionUser = loadSessionUser();
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
    const result = AuthController.authenticate(pin, users);
    if (result.success) setCurrentUser(result.user!);
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
