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
import { rolesOf } from '../models/types';
import { useAuth } from './AuthContext';
import { useOrders } from './OrdersContext';
import { useTables } from './TablesContext';
import { useCatalog } from './CatalogContext';

export function RealtimeSyncEngine() {
  const { currentUser } = useAuth();
  const { orders, setOrders, setOrdersLoaded, setLive } = useOrders();
  // The latest bills, readable inside realtime callbacks (state updates apply later).
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  // Bills created by a realtime INSERT whose state update hasn't applied yet.
  const justAdded = useRef<Set<string>>(new Set());
  const haveOrder = (id: string) => justAdded.current.has(id) || ordersRef.current.some(o => o.id === id);
  const { setTables } = useTables();
  const { setProducts, setCategories } = useCatalog();

  // Tables already flagged "needs waiter" (seeded from load) so we only alert on
  // a genuine NEW call (false → true), never on pre-existing/stale flags.
  const knownCalling = useRef<Set<string>>(new Set());
  // False until the channel's first SUBSCRIBED; distinguishes the initial
  // subscribe (initial load covers it) from a reconnect (which must resync).
  const subscribedRef = useRef(false);
  // Orders being fetched because an item arrived for a bill this device doesn't have yet.
  const fetching = useRef<Set<string>>(new Set());

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
    if (ordersRes.data)    { setOrders(ordersRes.data.map(mapOrder)); setOrdersLoaded(true); }
    justAdded.current.clear();
  }, [currentUser, setProducts, setCategories, setTables, setOrders, setOrdersLoaded]);

  /** One bill with its items — only when this device is missing it (was: reload everything). */
  const fetchOrder = useCallback(async (orderId: string) => {
    if (fetching.current.has(orderId)) return;
    fetching.current.add(orderId);
    try {
      const { data } = await supabase.from('orders').select('*, order_items(*)').eq('id', orderId).maybeSingle();
      if (!data) return;
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const shown = data.status === 'open' || (data.status === 'completed' && new Date(data.created_at) >= todayStart);
      const mapped = mapOrder(data);
      setOrders(prev => !shown ? prev.filter(o => o.id !== mapped.id)
        : prev.some(o => o.id === mapped.id) ? prev.map(o => o.id === mapped.id ? mapped : o) : [...prev, mapped]);
    } finally {
      fetching.current.delete(orderId);
    }
  }, [setOrders]);

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
        const available = (x: any) => (x.kitchenStatus || 'available') === 'available' && (x.availabilityStatus || 'available') === 'available';
        // The kitchen just marked an item finished: tell the floor (like a table call); clear it when it's back.
        const toldFloor = rolesOf(currentUser).some(r => ['waiter', 'swaiter', 'cashier', 'manager', 'admin'].includes(r));
        setProducts(prev => {
          const before = prev.find(prod => prod.id === mapped.id);
          if (toldFloor && before && available(before) && !available(mapped)) {
            AlertService.push({ id: `item-${mapped.id}`, kind: 'item', title: 'Item Finished', body: `${mapped.name} is not available now (kitchen)` });
          } else if (available(mapped)) {
            AlertService.dismiss(`item-${mapped.id}`);
          }
          return before ? prev.map(prod => prod.id === mapped.id ? mapped : prod) : [...prev, mapped];
        });
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

        // The change carries the whole bill row: apply it and keep the items this device
        // already has (items arrive as their own changes). Nothing is downloaded, except a
        // bill this device has never seen, updated rather than created (e.g. after a gap).
        if (payload.eventType === 'UPDATE' && !haveOrder(orderRow.id)) {
          void fetchOrder(orderRow.id);
          return;
        }
        if (payload.eventType === 'INSERT') {
          justAdded.current.add(orderRow.id);
          setTimeout(() => justAdded.current.delete(orderRow.id), 10_000);
        }
        setOrders(prev => {
          const existing = prev.find(o => o.id === orderRow.id);
          const mapped = { ...mapOrder({ ...orderRow, order_items: [] }), items: existing?.items ?? [] };
          return existing ? prev.map(o => o.id === mapped.id ? mapped : o) : [...prev, mapped];
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

        if (!haveOrder(item.order_id)) { void fetchOrder(item.order_id); return; }
        setOrders(prev => {
          if (!prev.some(o => o.id === item.order_id)) return prev;

          return prev.map(order => {
            if (order.id !== item.order_id) return order;
            const mapped = mapOrderItem(item);
            const others = (order.items || []).filter(i => i.id !== item.id);
            return { ...order, items: payload.eventType === 'DELETE' ? others : [...others, mapped] };
          });
        });
      })
      .subscribe((status) => {
        // On every (re)subscribe after the first, reconcile full state: Supabase
        // does not replay postgres_changes missed while the socket was dropped,
        // so without this a reconnect leaves the terminal silently out of sync.
        setLive(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') {
          if (subscribedRef.current) void syncAll();
          subscribedRef.current = true;
        }
      });

    return () => { setLive(false); supabase.removeChannel(channel); };
  }, [currentUser, setOrders, setTables, setProducts, setCategories, syncAll, fetchOrder, setLive]);

  // ── Initial load only — realtime subscriptions handle all subsequent updates ──
  useEffect(() => {
    if (!currentUser) return;
    void syncAll();
  }, [currentUser, syncAll]);

  // Reconcile when the network returns, or when the tablet wakes after more than 2 minutes
  // away — the realtime socket may have missed changes. A short screen-off keeps the socket,
  // and a full reload on every wake was one of the largest data users (free plan: 5 GB/month).
  useEffect(() => {
    if (!currentUser) return;
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > 2 * 60_000) void syncAll();
      hiddenAt = 0;
    };
    const onOnline = () => void syncAll();
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [currentUser, syncAll]);

  return null; // pure side-effect component
}
