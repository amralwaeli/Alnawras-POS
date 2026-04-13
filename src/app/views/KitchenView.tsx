import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { usePOS } from '../context/POSContext';
import { CheckCircle2, Clock4, ChefHat, Bell } from 'lucide-react';
import { toast } from 'sonner';

type KitchenStatus = 'available' | 'out-of-stock' | 'finished';

const itemStatusFlow: Record<string, string> = {
  pending: 'preparing',
  preparing: 'ready',
  ready: 'served',
};

const itemStatusColors: Record<string, { badge: string; btn: string; label: string }> = {
  pending:   { badge: 'bg-gray-100 text-gray-700 border-gray-200',    btn: 'bg-amber-500 hover:bg-amber-600 text-white',   label: 'Start Preparing' },
  preparing: { badge: 'bg-amber-100 text-amber-700 border-amber-200', btn: 'bg-emerald-500 hover:bg-emerald-600 text-white', label: 'Mark Ready' },
  ready:     { badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', btn: 'bg-blue-500 hover:bg-blue-600 text-white', label: 'Mark Served' },
  served:    { badge: 'bg-blue-100 text-blue-700 border-blue-200', btn: '', label: 'Served' },
};

export function KitchenView() {
  const { products, currentUser, updateProduct } = usePOS();
  const [tickets, setTickets] = useState<any[]>([]);
  const [tab, setTab] = useState<'orders' | 'products'>('orders');
  const [newOrderAlert, setNewOrderAlert] = useState(false);

  const loadTickets = async () => {
    const { data: orders } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('status', 'open')
      .eq('branch_id', 'branch-1')
      .order('created_at', { ascending: true });

    if (orders) {
      setTickets(
        orders.map(o => ({
          ...o,
          items: (o.order_items || []).filter((i: any) => i.status !== 'served'),
        })).filter(o => o.items.length > 0)
      );
    }
  };

  useEffect(() => {
    loadTickets();
    const channel = supabase.channel('kitchen-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
        loadTickets();
        setNewOrderAlert(true);
        setTimeout(() => setNewOrderAlert(false), 3000);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => {
        loadTickets();
        toast('🔔 New order received!', { duration: 4000 });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const advanceItem = async (itemId: string, currentStatus: string) => {
    const next = itemStatusFlow[currentStatus];
    if (!next) return;
    await supabase.from('order_items').update({ status: next }).eq('id', itemId);
    setTickets(prev =>
      prev.map(t => ({
        ...t,
        items: t.items
          .map((i: any) => i.id === itemId ? { ...i, status: next } : i)
          .filter((i: any) => i.status !== 'served'),
      })).filter(t => t.items.length > 0)
    );
    if (next === 'ready') toast.success('Item ready — notify waiter!');
  };

  const set = (id: string, status: KitchenStatus) => updateProduct(id, { kitchenStatus: status });

  const counts = {
    available: products.filter(p => p.kitchenStatus === 'available').length,
    finished:  products.filter(p => p.kitchenStatus === 'finished').length,
    'out-of-stock': products.filter(p => p.kitchenStatus === 'out-of-stock').length,
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-950 text-white">
      <div className="p-6 space-y-6 max-w-7xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 bg-orange-500 rounded-xl flex items-center justify-center">
              <ChefHat className="size-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Kitchen Display</h1>
              <p className="text-gray-400 text-sm">{tickets.length} active ticket{tickets.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {newOrderAlert && (
              <div className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-xl animate-pulse">
                <Bell className="size-4" /> New order!
              </div>
            )}
            <div className="flex bg-gray-800 rounded-xl p-1">
              <button onClick={() => setTab('orders')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'orders' ? 'bg-white text-gray-900' : 'text-gray-400 hover:text-white'}`}>
                Order Tickets
              </button>
              <button onClick={() => setTab('products')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'products' ? 'bg-white text-gray-900' : 'text-gray-400 hover:text-white'}`}>
                Item Status
              </button>
            </div>
          </div>
        </div>

        {tab === 'orders' ? (
          tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-600 gap-3">
              <CheckCircle2 className="size-16 opacity-30" />
              <p>All caught up! No pending orders.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tickets.map(ticket => {
                const age = Math.floor((Date.now() - new Date(ticket.created_at).getTime()) / 60000);
                const urgent = age >= 15;
                return (
                  <div key={ticket.id} className={`rounded-2xl border-2 p-4 space-y-3 ${urgent ? 'border-red-500 bg-red-950/30' : 'border-gray-700 bg-gray-900'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`size-8 rounded-lg flex items-center justify-center font-bold text-sm ${urgent ? 'bg-red-500' : 'bg-orange-500'}`}>
                          {ticket.table_number}
                        </div>
                        <span className="font-semibold">Table {ticket.table_number}</span>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${urgent ? 'bg-red-500/20 text-red-400' : 'bg-gray-700 text-gray-400'}`}>
                        <Clock4 className="size-3" />{age}m ago
                      </span>
                    </div>
                    <div className="space-y-2">
                      {ticket.items.map((item: any) => {
                        const s = itemStatusColors[item.status] ?? itemStatusColors.pending;
                        return (
                          <div key={item.id} className="flex items-center justify-between bg-gray-800 rounded-xl px-3 py-2.5">
                            <div>
                              <p className="text-sm font-medium">{item.product_name}</p>
                              <span className={`text-xs px-2 py-0.5 rounded-full border ${s.badge}`}>{item.status}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">×{item.quantity}</span>
                              {item.status !== 'served' && (
                                <button onClick={() => advanceItem(item.id, item.status)} className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors ${s.btn}`}>
                                  {s.label}
                                </button>
                              )}
                            </div>
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
          <div className="bg-gray-900 rounded-2xl overflow-hidden border border-gray-700">
            <div className="grid grid-cols-3 gap-4 p-4 border-b border-gray-700">
              {(['available', 'finished', 'out-of-stock'] as const).map(s => (
                <div key={s} className={`rounded-xl p-3 text-center ${s === 'available' ? 'bg-emerald-900/40' : s === 'finished' ? 'bg-amber-900/40' : 'bg-red-900/40'}`}>
                  <p className={`text-2xl font-bold ${s === 'available' ? 'text-emerald-400' : s === 'finished' ? 'text-amber-400' : 'text-red-400'}`}>{counts[s]}</p>
                  <p className="text-xs text-gray-400 capitalize">{s.replace('-', ' ')}</p>
                </div>
              ))}
            </div>
            <div className="divide-y divide-gray-800">
              {products.map(p => (
                <div key={p.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-800/50">
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.category}</p>
                  </div>
                  <div className="flex gap-2">
                    {p.kitchenStatus !== 'available' && (
                      <button onClick={() => set(p.id, 'available')} className="px-2.5 py-1.5 text-xs rounded-lg bg-emerald-900 text-emerald-400 hover:bg-emerald-800 transition-colors">Available</button>
                    )}
                    {p.kitchenStatus !== 'finished' && (
                      <button onClick={() => set(p.id, 'finished')} className="px-2.5 py-1.5 text-xs rounded-lg bg-amber-900 text-amber-400 hover:bg-amber-800 transition-colors">Finished</button>
                    )}
                    {p.kitchenStatus !== 'out-of-stock' && (
                      <button onClick={() => set(p.id, 'out-of-stock')} className="px-2.5 py-1.5 text-xs rounded-lg bg-red-900 text-red-400 hover:bg-red-800 transition-colors">Out of Stock</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
