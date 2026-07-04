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
import { AlertService } from '../services/AlertService';
import { useAuth } from './AuthContext';
import { useOrders } from './OrdersContext';
import { useTables } from './TablesContext';
import { useCatalog } from './CatalogContext';

export function RealtimeSyncEngine() {
  const { currentUser } = useAuth();
  const { setOrders } = useOrders();
  const { setTables } = useTables();
  const { setProducts, setCategories } = useCatalog();

  // Tables already flagged "needs waiter" (seeded from load) so we only alert on
  // a genuine NEW call (false → true), never on pre-existing/stale flags.
  const knownCalling = useRef<Set<string>>(new Set());

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
    if (tableRes.success) {
      setTables(tableRes.data);
      // Seed the "already calling" set so existing flags don't trigger alerts.
      knownCalling.current = new Set(tableRes.data.filter((t: any) => t.needsWaiter).map((t: any) => t.id));
    }
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
        if (!row?.id) return;

        // A removed table must be dropped from state (and any pending alert
        // cleared), not re-inserted from the stale `old` row — that left
        // deleted tables lingering as "ghost" tables on other terminals.
        if (p.eventType === 'DELETE') {
          setTables(prev => prev.filter(t => t.id !== row.id));
          knownCalling.current.delete(row.id);
          AlertService.dismiss(`table-${row.id}`);
          return;
        }

        const mapped = mapTable(row);
        setTables(prev =>
          prev.some(t => t.id === mapped.id)
            ? prev.map(t => t.id === mapped.id ? mapped : t)
            : [...prev, mapped]
        );

        // In-app beeping alert for floor staff — only on a NEW call (false→true),
        // never for tables that were already flagged when the app loaded.
        const floorStaff = ['waiter', 'swaiter', 'admin'].includes(currentUser.role);
        if (row?.id && floorStaff) {
          if (row.needs_waiter === true) {
            if (!knownCalling.current.has(row.id)) {
              knownCalling.current.add(row.id);
              AlertService.push({ id: `table-${row.id}`, kind: 'table', title: 'Table Calling', body: `Table ${mapped.number} needs a waiter`, tableId: row.id });
            }
          } else {
            knownCalling.current.delete(row.id);
            AlertService.dismiss(`table-${row.id}`);
          }
        }
      })
      // Product inserts / updates / (soft-)deletes
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `branch_id=eq.${branchId}` }, (p) => {
        const row = (p.new || p.old) as any;
        if (!row?.id) return;
        // Hard delete, or soft delete (is_active=false), drops it from the active
        // list; INSERT appends; UPDATE replaces. Previously only UPDATE was
        // handled, so newly added/removed products never appeared until reload.
        if (p.eventType === 'DELETE' || row.is_active === false) {
          setProducts(prev => prev.filter(prod => prod.id !== row.id));
          return;
        }
        const mapped = mapProduct(row);
        setProducts(prev =>
          prev.some(prod => prod.id === mapped.id)
            ? prev.map(prod => prod.id === mapped.id ? mapped : prod)
            : [...prev, mapped]
        );
      })
      // Orders
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` }, async (payload) => {
        const orderRow = (payload.new || payload.old) as any;
        if (!orderRow?.id) return;

        // In-app beeping alert for cashier/admin when a new pickup order comes in.
        if (payload.eventType === 'INSERT' && orderRow.order_type === 'pickup'
            && ['cashier', 'swaiter', 'admin'].includes(currentUser.role)) {
          AlertService.push({ id: `pickup-${orderRow.id}`, kind: 'pickup', title: 'New Pickup Order', body: `${orderRow.customer_name || 'A customer'} placed a pickup order` });
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
