import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Product, Order, User, Table, Category, Attendance, Expense } from '../models/types';
import { ProductController, CategoryController } from '../controllers/ProductController';
import { TableController } from '../controllers/TableController';
// FIXED PATH BELOW
import { AuthController } from '../controllers/AuthController';
import { StaffController } from '../controllers/StaffController';
import { supabase } from '../../lib/supabase';

interface POSContextType {
  supabase: typeof supabase;
  products: Product[];
  categories: Category[];
  orders: Order[];
  users: User[];
  tables: Table[];
  attendance: Attendance[];
  expenses: Expense[];
  currentUser: User | null;
  loading: boolean;
  login: (pin: string) => Promise<{ success: boolean; user?: User; error?: string }>;
  logout: () => void;
  setCurrentUser: (user: User | null) => void;
  setProducts: (p: Product[]) => void;
  updateProduct: (id: string, up: any) => Promise<any>;
  addProduct: (p: any) => Promise<any>;
  deleteProduct: (id: string) => Promise<any>;
  importProducts: (data: any[]) => Promise<any>;
  setCategories: (c: Category[]) => void;
  addCategory: (c: any) => Promise<any>;
  updateCategory: (id: string, up: any) => Promise<any>;
  deleteCategory: (id: string) => Promise<any>;
  setOrders: (o: Order[]) => void;
  setTables: (t: Table[]) => void;
  updateTable: (id: string, up: any) => Promise<any>;
  addTable: (t: any) => Promise<any>;
  deleteTable: (id: string) => Promise<any>;
  setUsers: (u: User[]) => void;
  addUser: (u: any) => Promise<any>;
  updateUser: (id: string, up: any) => Promise<any>;
  deleteUser: (id: string) => Promise<any>;
  setAttendance: (a: Attendance[]) => void;
  setExpenses: (e: Expense[]) => void;
}

const POSContext = createContext<POSContextType | undefined>(undefined);

export function POSProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const res = await StaffController.getStaff();
      if (res.success && res.data) setUsers(res.data);
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const branch = currentUser.branchId;

    const loadBranchData = async () => {
      const [prodRes, catRes, tableRes] = await Promise.all([
        ProductController.getProducts(currentUser),
        CategoryController.getCategories(currentUser),
        TableController.getTables(currentUser)
      ]);

      if (prodRes.success) setProducts(prodRes.products || []);
      if (catRes.success) setCategories(catRes.categories || []);
      if (tableRes.success) setTables(tableRes.tables || []);

      const { data: ordersData } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('branch_id', branch)
        .eq('status', 'open');

      if (ordersData) {
        setOrders(ordersData.map((o: any) => ({
          ...o,
          tableId: o.table_id,
          createdAt: new Date(o.created_at),
          items: (o.order_items || []).map((i: any) => ({
            ...i,
            productName: i.product_name,
            addedAt: new Date(i.added_at)
          }))
        })));
      }
    };
    loadBranchData();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const branch = currentUser.branchId;

    const channel = supabase.channel('pos-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, payload => {
        const item = payload.new as any;
        if (!item) return;

        setOrders(prev => prev.map(o => {
          if (o.id !== item.order_id) return o;
          const mappedItem = { ...item, productName: item.product_name, addedAt: new Date(item.added_at) };
          const filteredItems = (o.items || []).filter(i => i.id !== item.id);
          return { ...o, items: payload.eventType === 'DELETE' ? filteredItems : [...filteredItems, mappedItem] };
        }));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'products', filter: `branch_id=eq.${branch}` }, payload => {
        const updated = payload.new as any;
        setProducts(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated, availabilityStatus: updated.availability_status } : p));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables', filter: `branch_id=eq.${branch}` }, payload => {
        const table = payload.new as any;
        if (table) setTables(prev => prev.map(t => t.id === table.id ? { ...t, ...table } : t));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentUser]);

  const login = async (pin: string) => {
    const result = AuthController.authenticate(pin, users);
    if (result.success) setCurrentUser(result.user!);
    return result;
  };

  const logout = () => setCurrentUser(null);

  const updateProduct = async (id: string, up: any) => ProductController.updateProduct(id, up, currentUser!);
  const addProduct = async (p: any) => ProductController.addProduct(p, currentUser!);
  const deleteProduct = async (id: string) => ProductController.deleteProduct(id, currentUser!);
  const importProducts = async (data: any[]) => ProductController.importProducts(data, currentUser!);
  
  const addCategory = async (c: any) => CategoryController.addCategory(c, currentUser!);
  const updateCategory = async (id: string, up: any) => CategoryController.updateCategory(id, up, currentUser!);
  const deleteCategory = async (id: string) => CategoryController.deleteCategory(id, currentUser!);

  const updateTable = async (id: string, up: any) => TableController.updateTable(id, up, currentUser!);
  const addTable = async (t: any) => TableController.addTable(t, currentUser!);
  const deleteTable = async (id: string) => TableController.deleteTable(id, currentUser!);

  const addUser = async (u: any) => {
    const res = await StaffController.addStaff(u);
    if (res.success && res.data) setUsers(prev => [...prev, res.data!]);
    return res;
  };
  const updateUser = async (id: string, up: any) => StaffController.updateStaff(id, up);
  const deleteUser = async (id: string) => StaffController.deleteStaff(id);

  return (
    <POSContext.Provider value={{
      supabase, products, categories, orders, users, tables, attendance, expenses, currentUser, loading,
      login, logout, setCurrentUser, setProducts, updateProduct, addProduct, deleteProduct, importProducts,
      setCategories, addCategory, updateCategory, deleteCategory, setOrders, setTables, updateTable, addTable, deleteTable,
      setUsers, addUser, updateUser, deleteUser, setAttendance: (a: any) => setAttendance(a), setExpenses: (e: any) => setExpenses(e)
    }}>
      {children}
    </POSContext.Provider>
  );
}

export const usePOS = () => {
  const context = useContext(POSContext);
  if (!context) throw new Error('usePOS must be used within POSProvider');
  return context;
};