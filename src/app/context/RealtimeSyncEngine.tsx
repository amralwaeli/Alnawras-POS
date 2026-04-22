/**
 * RealtimeSyncProvider
 * 
 * Owns ALL Supabase real-time subscriptions and the polling heartbeat.
 * Writes to Orders, Tables, and Catalog state via context setters.
 * No feature module should import this directly — it runs as a root wrapper.
 */
import { useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { ProductController, CategoryController } from '../controllers/ProductController';
import { TableController } from '../controllers/TableController';
import { useAuth } from './AuthContext';
import { useOrders, mapOrder, mapOrderItem } from './OrdersContext';
import { useTables } from './TablesContext';
import { useCatalog } from './CatalogContext';

export function RealtimeSyncEngine() {
  const { currentUser } = useAuth();
  const { setOrders } = useOrders();
  const { setTables } = useTables();
  const { setProducts, setCategories } = useCatalog();

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

    if (prodRes.success)   setProducts(prodRes.products || []);
    if (catRes.success)    setCategories(catRes.categories || []);
    if (tableRes.success)  setTables(tableRes.tables || []);
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
        const table = (p.new || p.old) as any;
        setTables(prev => {
          if (!prev.find(t => t.id === table.id))
            return [...prev, { ...table, currentOrderId: table.current_order_id }];
          return prev.map(t =>
            t.id === table.id ? { ...t, ...table, currentOrderId: table.current_order_id } : t
          );
        });
      })
      // Product updates
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'products', filter: `branch_id=eq.${branchId}` }, (p) => {
        const up = p.new as any;
        setProducts(prev => prev.map(prod =>
          prod.id === up.id ? { ...prod, ...up, categoryId: up.category_id, availabilityStatus: up.availability_status } : prod
        ));
      })
      // Orders
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` }, async (payload) => {
        const orderRow = (payload.new || payload.old) as any;
        if (!orderRow?.id) return;

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
        if (res.success) setCategories(res.categories || []);
      })
      // Order items — filtered by branch via order_id membership in state
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
