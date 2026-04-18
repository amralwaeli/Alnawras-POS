import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import { usePOS } from '../../context/POSContext';
import { CheckCircle2, Clock4, ChefHat, Bell, Search, Wifi } from 'lucide-react';
import { toast } from 'sonner';

type KitchenStatus = 'available' | 'out-of-stock' | 'finished';

const STATUS_FLOW: Record<string, string> = {
  pending: 'preparing',
  preparing: 'ready',
  ready: 'served',
};

const STATUS_STYLE: Record<string, { badge: string; btn: string; label: string }> = {
  pending:   { badge: 'bg-gray-800 text-amber-400 border-amber-900/50',           btn: 'bg-amber-500 hover:bg-amber-600 text-white',   label: 'Start Preparing' },
  preparing: { badge: 'bg-amber-900/30 text-amber-200 border-amber-700/50',       btn: 'bg-emerald-500 hover:bg-emerald-600 text-white', label: 'Mark Ready' },
  ready:     { badge: 'bg-emerald-900/30 text-emerald-300 border-emerald-700/50', btn: 'bg-blue-500 hover:bg-blue-600 text-white',       label: 'Mark Served' },
  served:    { badge: 'bg-blue-900/20 text-blue-400 border-blue-900/30',          btn: '',                                               label: 'Done' },
};

export function KitchenView() {
  const { products, currentUser, updateProduct } = usePOS();
  const [tickets, setTickets]     = useState<any[]>([]);
  const [tab, setTab]             = useState<'orders' | 'products'>('orders');
  const [newAlert, setNewAlert]   = useState(false);
  const [inventorySearch, setInventorySearch] = useState('');
  const [connected, setConnected] = useState(true);

  const loadTickets = useCallback(async () => {
    if (!currentUser) return;
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('status', 'open')
      .eq('branch_id', currentUser.branchId)
      .order('created_at', { ascending: true });
    if (error) return;
    if (orders) {
      const active = orders
        .map(o => ({ ...o, items: (o.order_items || []).filter((i: any) => i.status !== 'served') }))
        .filter(o => o.items.length > 0);
      setTickets(active);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    void loadTickets();

    const channel = supabase
      .channel('kitchen-tickets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, (payload) => {
        void loadTickets();
        if (payload.eventType === 'INSERT') {
          setNewAlert(true);
          new Audio('/notification.mp3').play().catch(() => {});
          setTimeout(() => setNewAlert(false), 5000);
          toast('New order item!', { style: { background: '#f97316', color: '#fff', fontWeight: 700 } });
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => {
        void loadTickets();
        toast('New Order Received!', { style: { background: '#f97316', color: '#fff', fontWeight: 700 } });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => void loadTickets())
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'));

    const poll = setInterval(loadTickets, 250);
    return () => { supabase.removeChannel(channel); clearInterval(poll); };
  }, [currentUser, loadTickets]);

  const advanceItem = async (itemId: string, currentStatus: string) => {
    const next = STATUS_FLOW[currentStatus];
    if (!next) return;
    if (next === 'served') {
      setTickets(prev =>
        prev.map(t => ({ ...t, items: t.items.filter((i: any) => i.id !== itemId) }))
            .filter(t => t.items.length > 0)
      );
    } else {
      setTickets(prev =>
        prev.map(t => ({ ...t, items: t.items.map((i: any) => i.id === itemId ? { ...i, status: next } : i) }))
      );
    }
    const { error } = await supabase.from('order_items').update({ status: next }).eq('id', itemId);
    if (error) { toast.error('Update failed — reloading'); void loadTickets(); }
    else if (next === 'ready') toast.success('Item ready for pickup!');
  };

  const toggleAvailability = (id: string, isAvailable: boolean) => {
    updateProduct(id, { availabilityStatus: isAvailable ? 'out-of-stock' : 'available' });
    toast.success(`Marked as ${isAvailable ? 'unavailable' : 'available'}`);
  };

  const filteredProducts = useMemo(() => {
    if (!inventorySearch.trim()) return products;
    const q = inventorySearch.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
  }, [products, inventorySearch]);

  const counts = {
    available:   filteredProducts.filter(p => (p.kitchenStatus || 'available') === 'available').length,
    unavailable: filteredProducts.filter(p => (p.kitchenStatus || 'available') !== 'available').length,
  };

  if (!currentUser) return null;

  return (
    <div className="h-screen flex flex-col bg-[#0B0E14] text-white overflow-hidden">

      <header className="shrink-0 h-20 bg-[#161B22] border-b border-white/[0.06] px-8 flex items-center justify-between shadow-2xl z-10">
        <div className="flex items-center gap-4">
          <div className="size-12 bg-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/25">
            <ChefHat className="size-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter uppercase italic">Kitchen Display</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-orange-500 text-[10px] font-bold uppercase tracking-[0.2em]">Live Monitoring</p>
              <span className={`flex items-center gap-1 text-[10px] font-bold ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
                <Wifi className="size-3" />{connected ? 'Connected' : 'Reconnecting…'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {newAlert && (
            <div className="flex items-center gap-2 bg-orange-500 text-white px-6 py-2.5 rounded-full font-black text-sm animate-bounce shadow-lg shadow-orange-500/30">
              <Bell className="size-4" /> NEW ORDER
            </div>
          )}
          <div className="flex bg-[#0B0E14] rounded-2xl p-1.5 border border-white/[0.06]">
            {(['orders', 'products'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${tab === t ? 'bg-orange-500 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}>
                {t === 'orders' ? `Tickets (${tickets.length})` : 'Inventory'}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-8 kitchen-scroll">
        {tab === 'orders' ? (
          tickets.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-700">
              <div className="bg-gray-900/50 p-10 rounded-[50px] mb-6">
                <CheckCircle2 className="size-24 opacity-10" />
              </div>
              <h2 className="text-2xl font-bold uppercase tracking-widest opacity-20">Kitchen Clear</h2>
              <p className="text-gray-600 text-sm mt-2 opacity-40">All orders complete</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {tickets.map(ticket => {
                const age = Math.floor((Date.now() - new Date(ticket.created_at).getTime()) / 60000);
                const isUrgent = age >= 15;
                const isTakeaway = ticket.order_type === 'takeaway';
                return (
                  <div key={ticket.id} className={`flex flex-col rounded-[32px] border-b-8 overflow-hidden shadow-2xl transition-all duration-300 ${
                    isUrgent ? 'bg-red-950/20 border-red-600' : isTakeaway ? 'bg-[#161B22] border-purple-500' : 'bg-[#161B22] border-orange-500'
                  }`}>
                    <div className="p-5 flex items-center justify-between border-b border-white/5 bg-white/[0.03]">
                      <div className="flex items-center gap-3">
                        <div className={`size-10 rounded-xl flex items-center justify-center font-black text-lg shadow-inner ${
                          isTakeaway ? 'bg-purple-500' : isUrgent ? 'bg-red-600' : 'bg-orange-500'
                        }`}>{isTakeaway ? '🛍️' : ticket.table_number}</div>
                        <span className="font-black text-xl tracking-tighter italic uppercase">
                          {isTakeaway ? 'Takeaway' : `Table ${ticket.table_number}`}
                        </span>
                      </div>
                      <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        isUrgent ? 'bg-red-600 text-white animate-pulse' : age >= 10 ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400'
                      }`}><Clock4 className="size-3" />{age}m</div>
                    </div>
                    <div className="flex-1 p-5 space-y-3">
                      {ticket.items.map((item: any) => {
                        const style = STATUS_STYLE[item.status] || STATUS_STYLE.pending;
                        return (
                          <div key={item.id} className="bg-[#0B0E14] border border-white/[0.06] rounded-2xl p-4 flex flex-col gap-3">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <p className="text-base font-bold leading-tight">{item.product_name}</p>
                                <span className={`inline-block mt-2 px-2 py-0.5 rounded-lg border text-[9px] font-black uppercase tracking-widest ${style.badge}`}>{item.status}</span>
                              </div>
                              <span className="text-2xl font-black text-orange-500 ml-2 leading-none">×{item.quantity}</span>
                            </div>
                            {item.notes && (
                              <p className="text-[10px] text-amber-400 font-bold bg-amber-500/10 p-2 rounded-lg italic border border-amber-900/30">"{item.notes}"</p>
                            )}
                            {item.status !== 'served' && (
                              <button onClick={() => advanceItem(item.id, item.status)}
                                className={`w-full py-3 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg transition-all active:scale-95 ${style.btn}`}>
                                {style.label}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <div className="max-w-4xl mx-auto bg-[#161B22] rounded-[40px] border border-white/[0.06] overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-white/[0.06] bg-white/[0.02]">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-gray-500" />
                <input type="text" placeholder="Search products…" value={inventorySearch}
                  onChange={e => setInventorySearch(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-[#0B0E14] border-2 border-white/[0.08] rounded-2xl text-white placeholder:text-gray-600 focus:outline-none focus:border-orange-500 transition-all" />
              </div>
            </div>
            <div className="grid grid-cols-2 divide-x divide-white/[0.06] bg-white/[0.02] p-8 border-b border-white/[0.06]">
              <div className="text-center">
                <p className="text-5xl font-black italic tracking-tighter text-emerald-400">{counts.available}</p>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-2">Available</p>
              </div>
              <div className="text-center">
                <p className="text-5xl font-black italic tracking-tighter text-red-400">{counts.unavailable}</p>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-2">Unavailable</p>
              </div>
            </div>
            <div className="divide-y divide-white/[0.04] max-h-[60vh] overflow-y-auto kitchen-scroll">
              {filteredProducts.length === 0 ? (
                <div className="text-center py-16 text-gray-600"><p className="text-lg font-bold">No products found</p></div>
              ) : filteredProducts.map(p => {
                const isAvailable = (p.kitchenStatus || 'available') === 'available';
                return (
                  <div key={p.id} className={`flex items-center justify-between px-8 py-5 transition-colors ${!isAvailable ? 'bg-red-950/20' : 'hover:bg-white/[0.02]'}`}>
                    <div>
                      <div className="flex items-center gap-3">
                        <p className={`text-lg font-bold ${!isAvailable ? 'text-red-400' : 'text-white'}`}>{p.name}</p>
                        {!isAvailable && <span className="px-2 py-0.5 bg-red-600 text-white text-[9px] font-black uppercase tracking-widest rounded-lg">Unavailable</span>}
                      </div>
                      <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mt-1">{p.category}</p>
                    </div>
                    <button onClick={() => toggleAvailability(p.id, isAvailable)}
                      className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest border-2 transition-all active:scale-95 ${
                        isAvailable ? 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700' : 'bg-red-600 border-red-600 text-white hover:bg-red-700'
                      }`}>
                      {isAvailable ? 'Available' : 'Unavailable'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
      <style>{`.kitchen-scroll::-webkit-scrollbar{width:5px}.kitchen-scroll::-webkit-scrollbar-thumb{background:#1F2937;border-radius:10px}`}</style>
    </div>
  );
}
