import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../models/types';
import { AuthController } from '../controllers/AuthController';
import { StaffController } from '../controllers/StaffController';

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
  const [currentUser, setCurrentUserState] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [authLoading, setAuthLoading] = useState(true);

  const setCurrentUser = (u: User | null) => {
    setCurrentUserState(u);
  };

  useEffect(() => {
    StaffController.getStaff().then(res => {
      if (res.success && res.data) {
        setUsers(res.data);
      }
    }).finally(() => {
      setAuthLoading(false);
    });
  }, []);

  const login = async (pin: string) => {
    const result = await AuthController.authenticate(pin);
    if (result.success) {
      window.location.hash = '#/';
      setCurrentUser(result.user!);
    }
    return result;
  };

  const logout = () => {
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
