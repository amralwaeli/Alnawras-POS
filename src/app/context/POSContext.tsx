import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Product, Order, User, Table, Category, Attendance, Expense } from '../models/types';
import { ProductController, CategoryController } from '../controllers/ProductController';
import { TableController } from '../controllers/TableController';
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
  refreshData: () => Promise<void>;
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

  const syncFullSystem = useCallback(async () => {
    if (!currentUser) return;
    const branch = currentUser.branchId;
    try {
      const [prodRes, catRes, tableRes, ordersRes] = await Promise.all([
        ProductController.getProducts(currentUser),
        CategoryController.getCategories(currentUser),
        TableController.getTables(currentUser),
        supabase.from('orders').select('*, order_items(*)').eq('branch_id', branch).eq('status', 'open')
      ]);

      if (prodRes.success) setProducts(prodRes.products || []);
      if (catRes.success) setCategories(catRes.categories || []);
      if (tableRes.success) setTables(tableRes.tables || []);
      if (ordersRes.data) {
        setOrders(ordersRes.data.map((o: any) => ({
          ...o, tableId: o.table_id, createdAt: new Date(o.created_at),
          items: (o.order_items || []).map((i: any) => ({
            ...i, productName: i.product_name, addedAt: new Date(i.added_at)
          }))
        })));
      }
    } catch (err) { console.error("Sync Error:", err); }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const branchId = currentUser.branchId;
    const channel = supabase.channel('pos-ultra-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables', filter: `branch_id=eq.${branchId}` }, (p) => {
        const table = (p.new || p.old) as any;
        setTables(prev => prev.map(t => t.id === table.id ? { ...t, ...table, currentOrderId: table.current_order_id } : t));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'products', filter: `branch_id=eq.${branchId}` }, (p) => {
        const up = p.new as any;
        setProducts(prev => prev.map(prod => prod.id === up.id ? { ...prod, ...up, categoryId: up.category_id, availabilityStatus: up.availability_status } : prod));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, (payload) => {
        const item = (payload.new || payload.old) as any;
        // Logic to update the items inside the specific order
        setOrders(prev => prev.map(order => {
          if (order.id !== item.order_id) return order;
          const mappedItem = { ...item, productName: item.product_name, addedAt: new Date(item.added_at) };
          const otherItems = (order.items || []).filter(i => i.id !== item.id);
          return {
            ...order,
            items: payload.eventType === 'DELETE' ? otherItems : [...otherItems, mappedItem]
          };
        }));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    syncFullSystem().then(() => setLoading(false));
    const int = setInterval(syncFullSystem, 30000);
    return () => clearInterval(int);
  }, [currentUser, syncFullSystem]);

  useEffect(() => {
    StaffController.getStaff().then(res => { if (res.success && res.data) setUsers(res.data); });
  }, []);

  const login = async (pin: string) => {
    const result = AuthController.authenticate(pin, users);
    if (result.success) setCurrentUser(result.user!);
    return result;
  };
  const logout = () => { setCurrentUser(null); setProducts([]); setOrders([]); setTables([]); };
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
      refreshData: syncFullSystem, login, logout, setCurrentUser: (u) => setCurrentUser(u),
      setProducts, updateProduct, addProduct, deleteProduct, importProducts, setCategories, addCategory, 
      updateCategory, deleteCategory, setOrders, setTables, updateTable, addTable, deleteTable, setUsers, 
      addUser, updateUser, deleteUser, setAttendance: (a) => setAttendance(a), setExpenses: (e) => setExpenses(e)
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
