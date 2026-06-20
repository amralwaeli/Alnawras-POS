/**
 * RealtimeSyncProvider
 *
 * Owns ALL Supabase real-time subscriptions and the initial load.
 * Writes to Orders, Tables, and Catalog state via context setters.
 * No feature module should import this directly — it runs as a root wrapper.
 */
import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { ProductController, CategoryController } from '../controllers/ProductController';
import { TableController } from '../controllers/TableController';
import { mapOrder, mapOrderItem, mapProduct, mapTable } from '../models/mappers';
import { NotificationService } from '../services/NotificationService';
import { useAuth } from './AuthContext';
import { useOrders } from './OrdersContext';
import { useTables } from './TablesContext';
import { useCatalog } from './CatalogContext';

export function RealtimeSyncEngine() {
  const { currentUser } = useAuth();
  const { setOrders } = useOrders();
  const { setTables } = useTables();
  const { setProducts, setCategories } = useCatalog();

  // Tables we've already notified are "calling", to avoid repeat notifications.
  const calledTables = useRef<Set<string>>(new Set());

  // Ask for notification permission once a staff member is logged in (APK only).
  useEffect(() => {
    if (currentUser) void NotificationService.init();
  }, [currentUser]);

  const syncAll = useCallback(async () => {
    if (!currentUser) return;
    const branch = currentUser.branchId;

    const [prodRes, catRes, tableRes, ordersRes] = await Promise.all([
      ProductController.getProducts(currentUser),
      CategoryController.getCategories(currentUser),
      TableController.getTables(currentUser),
      supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('branch_id', branch)
        .or(`status.eq.open,and(status.eq.completed,created_at.gte.${new Date(new Date().setHours(0,0,0,0)).toISOString()})`),
    ]);

    if (prodRes.success)   setProducts(prodRes.data);
    if (catRes.success)    setCategories(catRes.data);
    if (tableRes.success)  setTables(tableRes.data);
    if (ordersRes.data)    setOrders(ordersRes.data.map(mapOrder));
  }, [currentUser, setProducts, setCategories, setTables, setOrders]);

  // ── Realtime subscriptions ────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    const branchId = currentUser.branchId;

    const channel = supabase
      .channel('pos-ultra-sync')
      // Tables
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables', filter: `branch_id=eq.${branchId}` }, (p) => {
        const row = (p.new || p.old) as any;
        const mapped = mapTable(row);
        setTables(prev =>
          prev.some(t => t.id === mapped.id)
            ? prev.map(t => t.id === mapped.id ? mapped : t)
            : [...prev, mapped]
        );

        // Notify floor staff when a table calls for a waiter (once per call).
        const floorStaff = ['waiter', 'swaiter', 'admin'].includes(currentUser.role);
        if (row?.id && floorStaff) {
          if (row.needs_waiter === true) {
            if (!calledTables.current.has(row.id)) {
              calledTables.current.add(row.id);
              void NotificationService.notify('🔔 Table Calling', `Table ${mapped.number} needs a waiter`);
            }
          } else {
            calledTables.current.delete(row.id);
          }
        }
      })
      // Product updates
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'products', filter: `branch_id=eq.${branchId}` }, (p) => {
        const mapped = mapProduct(p.new as any);
        setProducts(prev => prev.map(prod => prod.id === mapped.id ? mapped : prod));
      })
      // Orders
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` }, async (payload) => {
        const orderRow = (payload.new || payload.old) as any;
        if (!orderRow?.id) return;

        // Notify cashier/admin staff when a new pickup order comes in.
        if (payload.eventType === 'INSERT' && orderRow.order_type === 'pickup'
            && ['cashier', 'swaiter', 'admin'].includes(currentUser.role)) {
          void NotificationService.notify('📦 New Pickup Order', `${orderRow.customer_name || 'A customer'} placed a pickup order`);
        }

        if (payload.eventType === 'DELETE') {
          setOrders(prev => prev.filter(o => o.id !== orderRow.id));
          return;
        }

        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const isCompletedToday =
          orderRow.status === 'completed' && new Date(orderRow.created_at) >= todayStart;

        if (orderRow.status !== 'open' && !isCompletedToday) {
          setOrders(prev => prev.filter(o => o.id !== orderRow.id));
          return;
        }

        const { data } = await supabase.from('orders').select('*, order_items(*)').eq('id', orderRow.id).single();
        if (!data) return;

        const mapped = mapOrder(data);
        setOrders(prev => {
          const exists = prev.some(o => o.id === mapped.id);
          return exists ? prev.map(o => o.id === mapped.id ? mapped : o) : [...prev, mapped];
        });
      })
      // Categories
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: `branch_id=eq.${branchId}` }, async () => {
        const res = await CategoryController.getCategories(currentUser);
        if (res.success) setCategories(res.data);
      })
      // Order items — filtered by branch via the branch_id column
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items', filter: `branch_id=eq.${branchId}` }, (payload) => {
        const item = (payload.new || payload.old) as any;
        if (!item?.order_id) return;

        setOrders(prev => {
          const hasOrder = prev.some(o => o.id === item.order_id);
          if (!hasOrder) { void syncAll(); return prev; }

          return prev.map(order => {
            if (order.id !== item.order_id) return order;
            const mapped = mapOrderItem(item);
            const others = (order.items || []).filter(i => i.id !== item.id);
            return { ...order, items: payload.eventType === 'DELETE' ? others : [...others, mapped] };
          });
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentUser, setOrders, setTables, setProducts, setCategories, syncAll]);

  // ── Initial load only — realtime subscriptions handle all subsequent updates ──
  useEffect(() => {
    if (!currentUser) return;
    void syncAll();
  }, [currentUser, syncAll]);

  return null; // pure side-effect component
}
