import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { usePOS } from '../context/POSContext';
import { CheckCircle2, Clock4, ChefHat, Bell, Utensils } from 'lucide-react';
import { toast } from 'sonner';

type KitchenStatus = 'available' | 'out-of-stock' | 'finished';

const itemStatusFlow: Record<string, string> = {
  pending: 'preparing',
  preparing: 'ready',
  ready: 'served',
};

const itemStatusColors: Record<string, { badge: string; btn: string; label: string }> = {
  pending:   { badge: 'bg-gray-800 text-amber-400 border-amber-900/50', btn: 'bg-amber-600 hover:bg-amber-700 text-white', label: 'Start' },
  preparing: { badge: 'bg-amber-900/30 text-amber-200 border-amber-700/50', btn: 'bg-emerald-600 hover:bg-emerald-700 text-white', label: 'Ready' },
  ready:     { badge: 'bg-emerald-900/30 text-emerald-300 border-emerald-700/50', btn: 'bg-blue-600 hover:bg-blue-700 text-white', label: 'Serve' },
  served:    { badge: 'bg-blue-900/20 text-blue-400 border-blue-900/30', btn: '', label: 'Done' },
};

export function KitchenView() {
  const { products, currentUser, updateProduct } = usePOS();
  const [tickets, setTickets] = useState<any[]>([]);
  const [tab, setTab] = useState<'orders' | 'products'>('orders');
  const [newOrderAlert, setNewOrderAlert] = useState(false);

  // ─── LOAD DATA ──────────────────────────────────────────────────────────────
  const loadTickets = useCallback(async () => {
    if (!currentUser) return;

    console.log('[Kitchen] Loading tickets from database...');
    
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('status', 'open')
      .eq('branch_id', currentUser.branchId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error("Kitchen Fetch Error:", error);
      return;
    }

    if (orders) {
      // Filter out tickets where ALL items are served or order has no unserved items
      const activeTickets = orders.map(o => ({
        ...o,
        items: (o.order_items || []).filter((i: any) => i.status !== 'served'),
      })).filter(o => o.items.length > 0 && o.items.some((i: any) => i.status !== 'served'));

      console.log('[Kitchen] Loaded', activeTickets.length, 'active tickets');
      setTickets(activeTickets);
    }
  }, [currentUser]);

  // ─── REALTIME & HEARTBEAT ───────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;

    loadTickets();

    // Listen for changes in order_items (no branch filter since column doesn't exist)
    const channel = supabase.channel('kitchen-ultra-sync')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'order_items'
      }, (payload) => {
        console.log('[Kitchen] Order item change:', payload.eventType, payload.new?.id, 'Status:', payload.new?.status);
        loadTickets();
        if (payload.eventType === 'INSERT') {
          setNewOrderAlert(true);
          const audio = new Audio('/notification.mp3');
          audio.play().catch(() => {});
          setTimeout(() => setNewOrderAlert(false), 5000);
        }
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'orders'
      }, () => {
        loadTickets();
        toast('🔔 New Order Received!', {
          style: { background: '#f97316', color: '#fff', fontWeight: 'bold' }
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders'
      }, (payload) => {
        console.log('[Kitchen] Order status changed:', payload.new?.id, 'Status:', payload.new?.status);
        loadTickets();
      })
      .subscribe();

    // Ultra-fast heartbeat: Refresh every 300ms for real-time sync
    const heartbeat = setInterval(loadTickets, 300);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(heartbeat);
    };
  }, [currentUser, loadTickets]);

  // ─── ACTIONS ────────────────────────────────────────────────────────────────
  const advanceItem = async (itemId: string, currentStatus: string) => {
    const next = itemStatusFlow[currentStatus];
    if (!next) return;

    // If marking as served, immediately remove from UI for instant feedback
    if (next === 'served') {
      setTickets(prev => {
        const updated = prev.map(t => ({
          ...t,
          items: t.items.filter((i: any) => i.id !== itemId)
        })).filter(t => t.items.length > 0);
        
        console.log('[Kitchen] Item served, removing from display. Remaining tickets:', updated.length);
        return updated;
      });
    } else {
      // Optimistic update for other status changes
      setTickets(prev => prev.map(t => ({
        ...t,
        items: t.items.map((i: any) => i.id === itemId ? { ...i, status: next } : i)
      })));
    }

    const { error } = await supabase.from('order_items').update({ status: next }).eq('id', itemId);

    if (error) {
      toast.error("Failed to update status");
      loadTickets(); // Rollback
    } else if (next === 'ready') {
      toast.success('Order ready for pickup!');
    } else if (next === 'served') {
      console.log('[Kitchen] Item served successfully in database');
    }
  };

  const toggleProductStatus = (id: string, status: KitchenStatus) => {
    console.log('[Kitchen] Toggling product status:', id, status);
    updateProduct(id, { kitchenStatus: status });
    toast.success(`Product marked as ${status === 'available' ? '✅ Available' : '❌ Not Available'}`);
  };

  const counts = {
    available: products.filter(p => (p.kitchenStatus || 'available') === 'available').length,
    unavailable: products.filter(p => (p.kitchenStatus || 'available') !== 'available').length,
  };

  if (!currentUser) return null;

  return (
    <div className="h-screen flex flex-col bg-[#0B0E14] text-white font-sans overflow-hidden">
      
      {/* ─── Header ─── */}
      <header className="h-20 bg-[#161B22] border-b border-gray-800 px-8 flex items-center justify-between shadow-xl z-10">
        <div className="flex items-center gap-4">
          <div className="size-12 bg-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20">
            <ChefHat className="size-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter uppercase italic">Kitchen Display</h1>
            <p className="text-orange-500 text-[10px] font-bold uppercase tracking-[0.2em]">Live Monitoring System</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {newOrderAlert && (
            <div className="flex items-center gap-2 bg-orange-600 text-white px-6 py-2.5 rounded-full font-black text-sm animate-bounce shadow-lg">
              <Bell className="size-4" /> NEW ORDER
            </div>
          )}
          
          <div className="flex bg-[#0B0E14] rounded-2xl p-1.5 border border-gray-800">
            <button 
              onClick={() => setTab('orders')} 
              className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${tab === 'orders' ? 'bg-orange-500 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
            >
              Tickets ({tickets.length})
            </button>
            <button 
              onClick={() => setTab('products')} 
              className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${tab === 'products' ? 'bg-orange-500 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
            >
              Inventory
            </button>
          </div>
        </div>
      </header>

      {/* ─── Content ─── */}
      <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        {tab === 'orders' ? (
          tickets.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-700">
              <div className="bg-gray-900/50 p-10 rounded-[50px] mb-6">
                <CheckCircle2 className="size-24 opacity-10" />
              </div>
              <h2 className="text-2xl font-bold uppercase tracking-widest opacity-20">Kitchen Clear</h2>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {tickets.map(ticket => {
                const age = Math.floor((Date.now() - new Date(ticket.created_at).getTime()) / 60000);
                const isUrgent = age >= 15;
                const isTakeaway = ticket.order_type === 'takeaway';

                return (
                  <div key={ticket.id} className={`flex flex-col rounded-[35px] border-b-8 overflow-hidden shadow-2xl transition-all ${isUrgent ? 'bg-red-950/20 border-red-600' : isTakeaway ? 'bg-[#161B22] border-purple-500' : 'bg-[#161B22] border-orange-500'}`}>
                    {/* Ticket Header */}
                    <div className="p-5 flex items-center justify-between border-b border-white/5 bg-white/5">
                      <div className="flex items-center gap-3">
                        <div className={`size-10 rounded-xl flex items-center justify-center font-black text-lg shadow-inner ${isTakeaway ? 'bg-purple-500' : isUrgent ? 'bg-red-600' : 'bg-orange-500'}`}>
                          {isTakeaway ? '🛍️' : ticket.table_number}
                        </div>
                        <span className="font-black text-xl tracking-tighter italic uppercase">
                          {isTakeaway ? 'Takeaway Order' : `Table ${ticket.table_number}`}
                        </span>
                      </div>
                      <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black ${isUrgent ? 'bg-red-600 text-white animate-pulse' : 'bg-gray-800 text-gray-400'}`}>
                        <Clock4 className="size-3" /> {age}M
                      </div>
                    </div>

                    {/* Ticket Items */}
                    <div className="flex-1 p-5 space-y-3">
                      {ticket.items.map((item: any) => {
                        const style = itemStatusColors[item.status] || itemStatusColors.pending;
                        return (
                          <div key={item.id} className="bg-[#0B0E14] border border-white/5 rounded-2xl p-4 flex flex-col gap-3">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <p className="text-base font-bold leading-tight">{item.product_name}</p>
                                <span className={`inline-block mt-2 px-2 py-0.5 rounded-lg border text-[9px] font-black uppercase tracking-widest ${style.badge}`}>
                                  {item.status}
                                </span>
                              </div>
                              <span className="text-xl font-black text-orange-500 ml-2">×{item.quantity}</span>
                            </div>
                            
                            {item.notes && (
                              <p className="text-[10px] text-amber-500 font-bold bg-amber-500/10 p-2 rounded-lg italic">
                                "{item.notes}"
                              </p>
                            )}

                            <button 
                              onClick={() => advanceItem(item.id, item.status)}
                              className={`w-full py-3 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg transition-all active:scale-95 ${style.btn}`}
                            >
                              {style.label}
                            </button>
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
          /* ─── Inventory Management ─── */
          <div className="max-w-4xl mx-auto bg-[#161B22] rounded-[40px] border border-gray-800 overflow-hidden shadow-2xl">
            <div className="grid grid-cols-2 divide-x divide-gray-800 bg-white/5 p-8 border-b border-gray-800">
              <div className="text-center">
                <p className="text-5xl font-black italic tracking-tighter text-emerald-500">{counts.available}</p>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-2">✅ Available</p>
              </div>
              <div className="text-center">
                <p className="text-5xl font-black italic tracking-tighter text-red-500">{counts.unavailable}</p>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-2">❌ Not Available</p>
              </div>
            </div>

            <div className="divide-y divide-gray-800 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {products.map(p => {
                const isAvailable = (p.kitchenStatus || 'available') === 'available';
                return (
                  <div key={p.id} className={`flex items-center justify-between px-8 py-5 transition-colors ${!isAvailable ? 'bg-red-950/20' : 'hover:bg-white/[0.02]'}`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <p className={`text-lg font-bold ${!isAvailable ? 'text-red-400' : 'text-white'}`}>{p.name}</p>
                        {!isAvailable && (
                          <span className="px-2 py-0.5 bg-red-600 text-white text-[9px] font-black uppercase tracking-widest rounded-lg">
                            Not Available
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-1">{p.category}</p>
                    </div>
                    <button
                      onClick={() => toggleProductStatus(p.id, isAvailable ? 'out-of-stock' : 'available')}
                      className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest border-2 transition-all active:scale-95 ${
                        isAvailable
                          ? 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-red-600 border-red-600 text-white hover:bg-red-700'
                      }`}
                    >
                      {isAvailable ? '✅ Available' : '❌ Not Available'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1F2937; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
      `}</style>
    </div>
  );
}
