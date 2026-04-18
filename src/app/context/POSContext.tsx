/**
 * POSContext (compatibility shim)
 *
 * Composes AuthContext + CatalogContext + TablesContext + OrdersContext into
 * the original usePOS() API so all existing view files continue to work
 * without any changes. New features should import the focused contexts directly.
 */
import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Attendance, Expense } from '../models/types';
import { AuthProvider, useAuth } from './AuthContext';
import { CatalogProvider, useCatalog } from './CatalogContext';
import { TablesProvider, useTables } from './TablesContext';
import { OrdersProvider, useOrders } from './OrdersContext';
import { RealtimeSyncEngine } from './RealtimeSyncEngine';
import { supabase } from '../../lib/supabase';

// ── Misc state that doesn't warrant its own context yet ──────────────────────
interface MiscContextType {
  attendance: Attendance[];
  expenses: Expense[];
  loading: boolean;
  setAttendance: (a: Attendance[]) => void;
  setExpenses: (e: Expense[]) => void;
  setLoading: (v: boolean) => void;
}
const MiscContext = createContext<MiscContextType | undefined>(undefined);

function MiscProvider({ children }: { children: ReactNode }) {
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  return (
    <MiscContext.Provider value={{ attendance, expenses, loading, setAttendance, setExpenses, setLoading }}>
      {children}
    </MiscContext.Provider>
  );
}

// ── Root provider that wires everything together ─────────────────────────────
function InnerProviders({ children }: { children: ReactNode }) {
  const { currentUser, setOrders: _setOrders } = useAuth() as any;
  return (
    <CatalogProvider currentUser={currentUser}>
      <TablesProvider currentUser={currentUser}>
        <OrdersProvider>
          <MiscProvider>
            <RealtimeSyncEngine />
            {children}
          </MiscProvider>
        </OrdersProvider>
      </TablesProvider>
    </CatalogProvider>
  );
}

export function POSProvider({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <InnerProviders>{children}</InnerProviders>
    </AuthProvider>
  );
}

// ── usePOS shim — exposes the original flat API ───────────────────────────────
export function usePOS() {
  const auth    = useAuth();
  const catalog = useCatalog();
  const tables  = useTables();
  const orders  = useOrders();
  const misc    = useContext(MiscContext);

  if (!misc) throw new Error('usePOS must be used within POSProvider');

  return {
    // supabase (some views use it directly)
    supabase,
    // auth
    currentUser:    auth.currentUser,
    users:          auth.users,
    setCurrentUser: auth.setCurrentUser,
    setUsers:       auth.setUsers,
    login:          auth.login,
    logout:         auth.logout,
    addUser:        auth.addUser,
    updateUser:     auth.updateUser,
    deleteUser:     auth.deleteUser,
    // catalog
    products:       catalog.products,
    categories:     catalog.categories,
    setProducts:    catalog.setProducts,
    setCategories:  catalog.setCategories,
    updateProduct:  catalog.updateProduct,
    addProduct:     catalog.addProduct,
    deleteProduct:  catalog.deleteProduct,
    importProducts: catalog.importProducts,
    addCategory:    catalog.addCategory,
    updateCategory: catalog.updateCategory,
    deleteCategory: catalog.deleteCategory,
    // tables
    tables:         tables.tables,
    setTables:      tables.setTables,
    updateTable:    tables.updateTable,
    addTable:       tables.addTable,
    deleteTable:    tables.deleteTable,
    // orders
    orders:         orders.orders,
    setOrders:      orders.setOrders,
    // misc
    attendance:     misc.attendance,
    expenses:       misc.expenses,
    loading:        misc.loading,
    setAttendance:  misc.setAttendance,
    setExpenses:    misc.setExpenses,
    // refreshData - no-op shim; RealtimeSyncEngine handles all syncing
    refreshData:    async () => {},
  };
}
