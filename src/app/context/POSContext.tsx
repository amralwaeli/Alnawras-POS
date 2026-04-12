import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Product, Order, User, Table, Payment, Attendance, Expense } from '../models/types';
import { mockProducts, mockOrders, mockUsers, mockTables, mockAttendance, mockExpenses } from '../models/mockData';
import { OrderController } from '../controllers/OrderController';
import { ProductController } from '../controllers/ProductController';
import { TableController } from '../controllers/TableController';
import { AuthController } from '../controllers/AuthController';

interface POSContextType {
  // State
  products: Product[];
  orders: Order[];
  users: User[];
  tables: Table[];
  attendance: Attendance[];
  expenses: Expense[];
  currentUser: User | null;

  // Auth actions
  login: (pin: string) => { success: boolean; user?: User; error?: string };
  logout: () => void;
  setCurrentUser: (user: User | null) => void;

  // Product actions
  setProducts: (products: Product[]) => void;
  updateProduct: (productId: string, updates: Partial<Product>) => void;

  // Order actions
  setOrders: (orders: Order[]) => void;

  // Table actions
  setTables: (tables: Table[]) => void;
  updateTable: (tableId: string, updates: Partial<Table>) => void;

  // User actions
  setUsers: (users: User[]) => void;

  // Attendance actions
  setAttendance: (attendance: Attendance[]) => void;

  // Expense actions
  setExpenses: (expenses: Expense[]) => void;
}

const POSContext = createContext<POSContextType | undefined>(undefined);

export function POSProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>(mockProducts);
  const [orders, setOrders] = useState<Order[]>(mockOrders);
  const [users, setUsers] = useState<User[]>(mockUsers);
  const [tables, setTables] = useState<Table[]>(mockTables);
  const [attendance, setAttendance] = useState<Attendance[]>(mockAttendance);
  const [expenses, setExpenses] = useState<Expense[]>(mockExpenses);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Auth actions
  const login = (pin: string) => {
    const result = AuthController.authenticate(pin, users);
    if (result.success && result.user) {
      setCurrentUser(result.user);
    }
    return result;
  };

  const logout = () => {
    setCurrentUser(null);
  };

  // Product actions
  const updateProduct = (productId: string, updates: Partial<Product>) => {
    const updated = ProductController.updateProduct(products, productId, updates);
    setProducts(updated);
  };

  // Table actions
  const updateTable = (tableId: string, updates: Partial<Table>) => {
    setTables(currentTables =>
      currentTables.map(t => t.id === tableId ? { ...t, ...updates } : t)
    );
  };

  return (
    <POSContext.Provider
      value={{
        products,
        orders,
        users,
        tables,
        attendance,
        expenses,
        currentUser,
        login,
        logout,
        setCurrentUser,
        setProducts,
        updateProduct,
        setOrders,
        setTables,
        updateTable,
        setUsers,
        setAttendance,
        setExpenses,
      }}
    >
      {children}
    </POSContext.Provider>
  );
}

export function usePOS() {
  const context = useContext(POSContext);
  if (!context) {
    throw new Error('usePOS must be used within POSProvider');
  }
  return context;
}
