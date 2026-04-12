import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Product, Order, User, Table, Payment, Attendance, Expense, Category } from '../models/types';
import { mockProducts, mockOrders, mockTables, mockAttendance, mockExpenses } from '../models/mockData';
import { OrderController } from '../controllers/OrderController';
import { ProductController, CategoryController } from '../controllers/ProductController';
import { TableController } from '../controllers/TableController';
import { AuthController } from '../controllers/AuthController';
import { StaffController } from '../controllers/StaffController';
import { supabase } from '../../lib/supabase';

interface POSContextType {
  // Supabase client
  supabase: typeof supabase;

  // State
  products: Product[];
  categories: Category[];
  orders: Order[];
  users: User[];
  tables: Table[];
  attendance: Attendance[];
  expenses: Expense[];
  currentUser: User | null;
  loading: boolean;

  // Auth actions
  login: (pin: string) => Promise<{ success: boolean; user?: User; error?: string }>;
  logout: () => void;
  setCurrentUser: (user: User | null) => void;

  // Product actions
  setProducts: (products: Product[]) => void;
  updateProduct: (productId: string, updates: Partial<Product>) => Promise<{ success: boolean; product?: Product; error?: string }>;
  addProduct: (product: Omit<Product, 'id' | 'createdAt'>) => Promise<{ success: boolean; product?: Product; error?: string }>;
  deleteProduct: (productId: string) => Promise<{ success: boolean; error?: string }>;
  importProducts: (importData: any[]) => Promise<{ success: boolean; imported?: number; errors?: string[]; error?: string }>;

  // Category actions
  setCategories: (categories: Category[]) => void;
  addCategory: (category: Omit<Category, 'id' | 'createdAt'>) => Promise<{ success: boolean; category?: Category; error?: string }>;
  updateCategory: (categoryId: string, updates: Partial<Category>) => Promise<{ success: boolean; category?: Category; error?: string }>;
  deleteCategory: (categoryId: string) => Promise<{ success: boolean; error?: string }>;

  // Order actions
  setOrders: (orders: Order[]) => void;

  // Table actions
  setTables: (tables: Table[]) => void;
  updateTable: (tableId: string, updates: Partial<Table>) => Promise<{ success: boolean; table?: Table; error?: string }>;
  addTable: (table: { number: number; capacity: number }) => Promise<{ success: boolean; table?: Table; error?: string }>;
  deleteTable: (tableId: string) => Promise<{ success: boolean; error?: string }>;

  // User actions
  setUsers: (users: User[]) => void;
  addUser: (user: Omit<User, 'id' | 'createdAt'>) => Promise<{ success: boolean; user?: User; error?: string }>;
  updateUser: (userId: string, updates: Partial<User>) => Promise<{ success: boolean; user?: User; error?: string }>;
  deleteUser: (userId: string) => Promise<{ success: boolean; error?: string }>;

  // Attendance actions
  setAttendance: (attendance: Attendance[]) => void;

  // Expense actions
  setExpenses: (expenses: Expense[]) => void;
}

const POSContext = createContext<POSContextType | undefined>(undefined);

export function POSProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<Order[]>(mockOrders);
  const [users, setUsers] = useState<User[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>(mockAttendance);
  const [expenses, setExpenses] = useState<Expense[]>(mockExpenses);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Load data from database on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load users
        const userResult = await StaffController.getStaff();
        if (userResult.success && userResult.data) {
          setUsers(userResult.data);
        } else {
          console.error('Failed to load users:', userResult.error);
          const { mockUsers } = await import('../models/mockData');
          setUsers(mockUsers);
        }

        // Load products and categories (will be loaded when user logs in)
        // Load tables (will be loaded when user logs in)

      } catch (error) {
        console.error('Error loading data:', error);
        // Fallback to mock data
        const { mockUsers } = await import('../models/mockData');
        setUsers(mockUsers);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Load products, categories, and tables when user logs in
  useEffect(() => {
    if (currentUser) {
      const loadUserData = async () => {
        try {
          // Load products
          const productResult = await ProductController.getProducts(currentUser);
          if (productResult.success && productResult.products) {
            setProducts(productResult.products);
          } else {
            console.error('Failed to load products:', productResult.error);
            setProducts(mockProducts);
          }

          // Load categories
          const categoryResult = await CategoryController.getCategories(currentUser);
          if (categoryResult.success && categoryResult.categories) {
            setCategories(categoryResult.categories);
          } else {
            console.error('Failed to load categories:', categoryResult.error);
            // Categories will be empty, that's fine
          }

          // Load tables
          const tableResult = await TableController.getTables(currentUser);
          if (tableResult.success && tableResult.tables) {
            setTables(tableResult.tables);
          } else {
            console.error('Failed to load tables:', tableResult.error);
            setTables(mockTables);
          }
        } catch (error) {
          console.error('Error loading user data:', error);
          setProducts(mockProducts);
          setTables(mockTables);
        }
      };

      loadUserData();
    }
  }, [currentUser]);

  // Auth actions
  const login = async (pin: string) => {
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
  const updateProduct = async (productId: string, updates: Partial<Product>) => {
    if (!currentUser) return { success: false, error: 'Not authenticated' };

    const result = await ProductController.updateProduct(productId, updates, currentUser);
    if (result.success && result.product) {
      setProducts(prev => prev.map(p => p.id === productId ? result.product! : p));
    }
    return result;
  };

  const addProduct = async (product: Omit<Product, 'id' | 'createdAt'>) => {
    if (!currentUser) return { success: false, error: 'Not authenticated' };

    const result = await ProductController.addProduct(product, currentUser);
    if (result.success && result.product) {
      setProducts(prev => [...prev, result.product!]);
    }
    return result;
  };

  const deleteProduct = async (productId: string) => {
    if (!currentUser) return { success: false, error: 'Not authenticated' };

    const result = await ProductController.deleteProduct(productId, currentUser);
    if (result.success) {
      setProducts(prev => prev.filter(p => p.id !== productId));
    }
    return result;
  };

  const importProducts = async (importData: any[]) => {
    if (!currentUser) return { success: false, error: 'Not authenticated' };

    const result = await ProductController.importProducts(importData, currentUser);
    if (result.success && result.imported && result.imported > 0) {
      // Reload products after import
      const productResult = await ProductController.getProducts(currentUser);
      if (productResult.success && productResult.products) {
        setProducts(productResult.products);
      }
    }
    return result;
  };

  // Category actions
  const addCategory = async (category: Omit<Category, 'id' | 'createdAt'>) => {
    if (!currentUser) return { success: false, error: 'Not authenticated' };

    const result = await CategoryController.addCategory(category, currentUser);
    if (result.success && result.category) {
      setCategories(prev => [...prev, result.category!]);
    }
    return result;
  };

  const updateCategory = async (categoryId: string, updates: Partial<Category>) => {
    if (!currentUser) return { success: false, error: 'Not authenticated' };

    const result = await CategoryController.updateCategory(categoryId, updates, currentUser);
    if (result.success && result.category) {
      setCategories(prev => prev.map(c => c.id === categoryId ? result.category! : c));
    }
    return result;
  };

  const deleteCategory = async (categoryId: string) => {
    if (!currentUser) return { success: false, error: 'Not authenticated' };

    const result = await CategoryController.deleteCategory(categoryId, currentUser);
    if (result.success) {
      setCategories(prev => prev.filter(c => c.id !== categoryId));
    }
    return result;
  };

  // Table actions
  const updateTable = async (tableId: string, updates: Partial<Table>) => {
    if (!currentUser) return { success: false, error: 'Not authenticated' };

    const result = await TableController.updateTable(tableId, updates, currentUser);
    if (result.success && result.table) {
      setTables(prev => prev.map(t => t.id === tableId ? result.table! : t));
    }
    return result;
  };

  const addTable = async (table: { number: number; capacity: number }) => {
    if (!currentUser) return { success: false, error: 'Not authenticated' };

    const result = await TableController.addTable(table, currentUser);
    if (result.success && result.table) {
      setTables(prev => [...prev, result.table!]);
    }
    return result;
  };

  const deleteTable = async (tableId: string) => {
    if (!currentUser) return { success: false, error: 'Not authenticated' };

    const result = await TableController.deleteTable(tableId, currentUser);
    if (result.success) {
      setTables(prev => prev.filter(t => t.id !== tableId));
    }
    return result;
  };

  // User actions
  const addUser = async (user: Omit<User, 'id' | 'createdAt'>) => {
    const result = await StaffController.addStaff(user);
    if (result.success && result.data) {
      setUsers(prev => [...prev, result.data!]);
      return { success: true, user: result.data };
    }
    return { success: false, error: result.error };
  };

  const updateUser = async (userId: string, updates: Partial<User>) => {
    const result = await StaffController.updateStaff(userId, updates);
    if (result.success && result.data) {
      setUsers(prev => prev.map(u => u.id === userId ? result.data! : u));
      return { success: true, user: result.data };
    }
    return { success: false, error: result.error };
  };

  const deleteUser = async (userId: string) => {
    const result = await StaffController.deleteStaff(userId);
    if (result.success) {
      setUsers(prev => prev.filter(u => u.id !== userId));
      return { success: true };
    }
    return { success: false, error: result.error };
  };

  return (
    <POSContext.Provider
      value={{
        supabase,
        products,
        categories,
        orders,
        users,
        tables,
        attendance,
        expenses,
        currentUser,
        loading,
        login,
        logout,
        setCurrentUser,
        setProducts,
        updateProduct,
        addProduct,
        deleteProduct,
        importProducts,
        setCategories,
        addCategory,
        updateCategory,
        deleteCategory,
        setOrders,
        setTables,
        updateTable,
        addTable,
        deleteTable,
        setUsers,
        addUser,
        updateUser,
        deleteUser,
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
