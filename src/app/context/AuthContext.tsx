import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../models/types';
import { AuthController } from '../controllers/AuthController';
import { StaffController } from '../controllers/StaffController';

interface AuthContextType {
  currentUser: User | null;
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

  useEffect(() => {
    StaffController.getStaff().then(res => {
      if (res.success && res.data) setUsers(res.data);
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
      currentUser, users, setCurrentUser, setUsers,
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
