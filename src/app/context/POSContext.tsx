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

  const mapOrderItem = useCallback((item: any) => ({
    ...item,
    productName: item.product_name,
    addedAt: item.created_at ? new Date(item.created_at) : new Date(),
  }), []);

  const mapOrder = useCallback((order: any) => ({
    ...order,
    tableId: order.table_id,
    createdAt: order.created_at ? new Date(order.created_at) : new Date(),
    items: (order.order_items || []).map(mapOrderItem),
  }), [mapOrderItem]);

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
        setOrders(ordersRes.data.map(mapOrder));
      }
    } catch (err) { console.error("Sync Error:", err); }
  }, [currentUser, mapOrder]);

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` }, async (payload) => {
        const orderRow = (payload.new || payload.old) as any;
        if (!orderRow?.id) return;

        if (payload.eventType === 'DELETE' || orderRow.status !== 'open') {
          setOrders(prev => prev.filter(order => order.id !== orderRow.id));
          return;
        }

        const { data } = await supabase
          .from('orders')
          .select('*, order_items(*)')
          .eq('id', orderRow.id)
          .single();

        if (!data) return;

        const mappedOrder = mapOrder(data);
        setOrders(prev => {
          const existing = prev.some(order => order.id === mappedOrder.id);
          if (existing) {
            return prev.map(order => order.id === mappedOrder.id ? mappedOrder : order);
          }
          return [...prev, mappedOrder];
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: `branch_id=eq.${branchId}` }, async () => {
        const catRes = await CategoryController.getCategories(currentUser);
        if (catRes.success) setCategories(catRes.categories || []);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, (payload) => {
        const item = (payload.new || payload.old) as any;
        if (!item?.order_id) return;

        setOrders(prev => {
          const hasOrder = prev.some(order => order.id === item.order_id);
          if (!hasOrder) {
            void syncFullSystem();
            return prev;
          }

          return prev.map(order => {
            if (order.id !== item.order_id) return order;
            const mappedItem = mapOrderItem(item);
            const otherItems = (order.items || []).filter(i => i.id !== item.id);
            return {
              ...order,
              items: payload.eventType === 'DELETE' ? otherItems : [...otherItems, mappedItem]
            };
          });
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUser, mapOrder, mapOrderItem, syncFullSystem]);

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
  const addCategory = async (c: any) => {
    const res = await CategoryController.addCategory(c, currentUser!);
    if (res.success) await syncFullSystem();
    return res;
  };
  const updateCategory = async (id: string, up: any) => {
    const res = await CategoryController.updateCategory(id, up, currentUser!);
    if (res.success) {
      setCategories(prev =>
        prev
          .map(category => category.id === id ? { ...category, ...up } : category)
          .sort((a, b) => a.displayOrder - b.displayOrder)
      );
    }
    return res;
  };
  const deleteCategory = async (id: string) => {
    const res = await CategoryController.deleteCategory(id, currentUser!);
    if (res.success) {
      setCategories(prev => prev.filter(category => category.id !== id));
    }
    return res;
  };
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
