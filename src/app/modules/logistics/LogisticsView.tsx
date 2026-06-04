import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { usePOS } from '../../context/POSContext';
import { RefreshCw, Package, Clock, CheckCircle2, ShoppingCart, Eye, Truck } from 'lucide-react';
import { toast } from 'sonner';

interface OrderItem { name: string; quantity: string; unit: string; }
interface IngredientOrder {
  id: string;
  requested_by: string;
  requested_by_name: string;
  role: string;
  items: OrderItem[];
  notes: string;
  status: 'pending' | 'seen' | 'ordered' | 'done';
  branch_id: string;
  created_at: string;
}

const STATUS_CONFIG = {
  pending: { label: 'Pending',  icon: Clock,         cls: 'bg-amber-100 text-amber-700 border-amber-200',   dot: 'bg-amber-500' },
  seen:    { label: 'Seen',     icon: Eye,           cls: 'bg-blue-100 text-blue-700 border-blue-200',       dot: 'bg-blue-500' },
  ordered: { label: 'Ordered',  icon: Truck,         cls: 'bg-violet-100 text-violet-700 border-violet-200', dot: 'bg-violet-500' },
  done:    { label: 'Received', icon: CheckCircle2,  cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
};

const ROLE_LABELS: Record<string, string> = {
  kitchen: 'Kitchen', juice: 'Juice Bar', admin: 'Admin',
  waiter: 'Waiter', cashier: 'Cashier', hr: 'HR',
};

export function LogisticsView() {
  const { currentUser } = usePOS();
  const [orders, setOrders] = useState<IngredientOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'seen' | 'ordered' | 'done'>('all');
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('ingredient_orders')
      .select('*')
      .eq('branch_id', currentUser.branchId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) toast.error('Failed to load requests');
    else setOrders((data as IngredientOrder[]) ?? []);
    setLoading(false);
  }, [currentUser]);

  useEffect(() => { void load(); }, [load]);

  const updateStatus = async (id: string, status: IngredientOrder['status']) => {
    setUpdating(id);
    const { error } = await supabase
      .from('ingredient_orders')
      .update({ status })
      .eq('id', id);
    if (error) toast.error('Failed to update status');
    else {
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
      toast.success(`Marked as ${STATUS_CONFIG[status].label}`);
    }
    setUpdating(null);
  };

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);

  const counts = {
    all: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    seen: orders.filter(o => o.status === 'seen').length,
    ordered: orders.filter(o => o.status === 'ordered').length,
    done: orders.filter(o => o.status === 'done').length,
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-4 sm:p-6 max-w-5xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Logistics</h1>
            <p className="text-gray-500 text-sm mt-0.5">Ingredient purchase requests from the kitchen team</p>
          </div>
          <button onClick={load} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium hover:bg-white transition-colors">
            <RefreshCw className="size-4" /> Refresh
          </button>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-2 flex-wrap">
          {(['all', 'pending', 'seen', 'ordered', 'done'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all border ${
                filter === s
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
              {s === 'all' ? 'All' : STATUS_CONFIG[s].label}
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${filter === s ? 'bg-white/20' : 'bg-gray-100'}`}>
                {counts[s]}
              </span>
            </button>
          ))}
        </div>

        {/* Orders list */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="size-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 py-20 text-center">
            <Package className="size-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">No requests found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(order => {
              const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
              const StatusIcon = cfg.icon;
              const date = new Date(order.created_at);
              return (
                <div key={order.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-xl bg-orange-100 flex items-center justify-center">
                        <ShoppingCart className="size-5 text-orange-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{order.requested_by_name}</p>
                        <p className="text-xs text-gray-400">
                          {ROLE_LABELS[order.role] ?? order.role} &nbsp;·&nbsp;
                          {date.toLocaleDateString('en-GB')} at {date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <span className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border ${cfg.cls}`}>
                      <StatusIcon className="size-3" />
                      {cfg.label}
                    </span>
                  </div>

                  {/* Items */}
                  <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 mb-4">
                    {order.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="font-medium text-gray-800">{item.name}</span>
                        <span className="text-gray-500 font-mono">{item.quantity} {item.unit}</span>
                      </div>
                    ))}
                  </div>

                  {/* Notes */}
                  {order.notes && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-4 italic">
                      {order.notes}
                    </p>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2 flex-wrap">
                    {order.status === 'pending' && (
                      <button
                        onClick={() => updateStatus(order.id, 'seen')}
                        disabled={updating === order.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 transition-colors disabled:opacity-50"
                      >
                        <Eye className="size-3.5" /> Mark Seen
                      </button>
                    )}
                    {(order.status === 'pending' || order.status === 'seen') && (
                      <button
                        onClick={() => updateStatus(order.id, 'ordered')}
                        disabled={updating === order.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 text-xs font-bold hover:bg-violet-100 transition-colors disabled:opacity-50"
                      >
                        <Truck className="size-3.5" /> Mark Ordered
                      </button>
                    )}
                    {order.status !== 'done' && (
                      <button
                        onClick={() => updateStatus(order.id, 'done')}
                        disabled={updating === order.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors disabled:opacity-50"
                      >
                        <CheckCircle2 className="size-3.5" /> Mark Received
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
