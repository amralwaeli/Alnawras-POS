import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Send, Clock, CheckCircle2, ShoppingCart, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';

// ── Config ────────────────────────────────────────────────────────────────────

const OWNER_WHATSAPP = '601111544800';

const UNITS = ['kg', 'g', 'L', 'mL', 'pieces', 'boxes', 'bags', 'bottles', 'cans', 'packs', 'dozen'];

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending',  cls: 'bg-amber-500/20 text-amber-300 border-amber-700/40' },
  seen:    { label: 'Seen',     cls: 'bg-blue-500/20 text-blue-300 border-blue-700/40' },
  ordered: { label: 'Ordered',  cls: 'bg-violet-500/20 text-violet-300 border-violet-700/40' },
  done:    { label: 'Received', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-700/40' },
};

interface OrderItem { name: string; quantity: string; unit: string; }
interface IngredientOrder {
  id: string;
  requested_by: string;
  requested_by_name: string;
  role: string;
  items: OrderItem[];
  notes: string;
  status: string;
  branch_id: string;
  created_at: string;
}

// ── WhatsApp helper ───────────────────────────────────────────────────────────

function buildWhatsAppMessage(order: {
  name: string;
  role: string;
  items: OrderItem[];
  notes: string;
  branchId: string;
}): string {
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const itemLines = order.items
    .filter(i => i.name.trim())
    .map(i => `  • ${i.name} — ${i.quantity} ${i.unit}`)
    .join('\n');

  const msg = [
    `🛒 *Ingredient Order Request*`,
    ``,
    `👤 From: ${order.name} (${order.role})`,
    `📅 Date: ${date} at ${time}`,
    ``,
    `📦 *Items Needed:*`,
    itemLines,
    order.notes ? `\n📝 *Notes:* ${order.notes}` : '',
    ``,
    `Please confirm when ordered. Thank you! 🙏`,
  ].filter(l => l !== undefined).join('\n');

  return msg;
}

function sendWhatsApp(message: string) {
  const encoded = encodeURIComponent(message);
  window.open(`https://wa.me/${OWNER_WHATSAPP}?text=${encoded}`, '_blank');
}

// ── Empty row ─────────────────────────────────────────────────────────────────

function emptyItem(): OrderItem { return { name: '', quantity: '1', unit: 'kg' }; }

// ── Main component ────────────────────────────────────────────────────────────

export function IngredientOrdersTab({ currentUser }: { currentUser: any }) {
  const [items, setItems]       = useState<OrderItem[]>([emptyItem()]);
  const [notes, setNotes]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory]   = useState<IngredientOrder[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [view, setView]         = useState<'form' | 'history'>('form');

  const loadHistory = useCallback(async () => {
    if (!currentUser) return;
    setLoadingHistory(true);
    const { data } = await supabase
      .from('ingredient_orders')
      .select('*')
      .eq('branch_id', currentUser.branchId)
      .eq('requested_by', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(30);
    setHistory((data as IngredientOrder[]) ?? []);
    setLoadingHistory(false);
  }, [currentUser]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const addRow    = () => setItems(p => [...p, emptyItem()]);
  const removeRow = (i: number) => setItems(p => p.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: keyof OrderItem, val: string) =>
    setItems(p => p.map((r, idx) => idx === i ? { ...r, [field]: val } : r));

  const handleSubmit = async () => {
    const validItems = items.filter(i => i.name.trim());
    if (validItems.length === 0) { toast.error('Add at least one item'); return; }

    setSubmitting(true);

    const msg = buildWhatsAppMessage({
      name:     currentUser.name,
      role:     currentUser.role,
      items:    validItems,
      notes:    notes.trim(),
      branchId: currentUser.branchId,
    });

    // Open WhatsApp immediately — don't block on DB
    sendWhatsApp(msg);

    // Save to DB in the background if the table exists
    supabase.from('ingredient_orders').insert([{
      requested_by:      currentUser.id,
      requested_by_name: currentUser.name,
      role:              currentUser.role,
      items:             validItems,
      notes:             notes.trim(),
      status:            'pending',
      branch_id:         currentUser.branchId,
    }]).then(({ error }) => {
      if (!error) { void loadHistory(); }
    });

    toast.success('WhatsApp opened — send the message to notify the owner.');
    setItems([emptyItem()]);
    setNotes('');
    setView('history');
    setSubmitting(false);
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">

      {/* Sub-tab switcher */}
      <div className="flex gap-2 mb-6 bg-[#0B0E14] rounded-2xl p-1.5 border border-white/[0.06] w-fit">
        {(['form', 'history'] as const).map(v => (
          <button
            key={v}
            onClick={() => { setView(v); if (v === 'history') void loadHistory(); }}
            className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              view === v ? 'bg-orange-500 text-white shadow-lg' : 'text-gray-500 hover:text-white'
            }`}
          >
            {v === 'form' ? 'New Request' : `History (${history.length})`}
          </button>
        ))}
      </div>

      {view === 'form' ? (
        <div className="bg-[#161B22] rounded-[32px] border border-white/[0.06] overflow-hidden shadow-2xl">
          <div className="p-6 border-b border-white/[0.06] bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="size-10 bg-orange-500 rounded-xl flex items-center justify-center">
                <ShoppingCart className="size-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight">Request Ingredients</h2>
                <p className="text-xs text-gray-500">Owner will be notified via WhatsApp</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-4">
            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Items Needed</p>
                <button
                  onClick={addRow}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/20 text-orange-400 text-xs font-bold hover:bg-orange-500/30 transition-colors"
                >
                  <Plus className="size-3.5" /> Add Item
                </button>
              </div>

              <div className="space-y-2">
                {items.map((item, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Ingredient name…"
                      value={item.name}
                      onChange={e => updateRow(i, 'name', e.target.value)}
                      className="flex-1 bg-[#0B0E14] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-orange-500 transition-colors"
                    />
                    <input
                      type="number"
                      min="0.1"
                      step="0.5"
                      value={item.quantity}
                      onChange={e => updateRow(i, 'quantity', e.target.value)}
                      className="w-20 bg-[#0B0E14] border border-white/[0.08] rounded-xl px-3 py-3 text-sm text-white text-center focus:outline-none focus:border-orange-500 transition-colors"
                    />
                    <select
                      value={item.unit}
                      onChange={e => updateRow(i, 'unit', e.target.value)}
                      className="w-24 bg-[#0B0E14] border border-white/[0.08] rounded-xl px-2 py-3 text-sm text-white focus:outline-none focus:border-orange-500 transition-colors"
                    >
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    {items.length > 1 && (
                      <button onClick={() => removeRow(i)} className="p-2 text-gray-600 hover:text-red-400 transition-colors">
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Notes (optional)</p>
              <textarea
                rows={3}
                placeholder="Any special requirements, urgency, brand preferences…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full bg-[#0B0E14] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-orange-500 transition-colors resize-none"
              />
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-4 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-black uppercase tracking-widest rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20"
            >
              <Send className="size-4" />
              {submitting ? 'Sending…' : 'Submit & Notify Owner via WhatsApp'}
            </button>
          </div>
        </div>
      ) : (
        /* History */
        <div className="bg-[#161B22] rounded-[32px] border border-white/[0.06] overflow-hidden shadow-2xl">
          <div className="p-6 border-b border-white/[0.06] bg-white/[0.02] flex items-center justify-between">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Your Requests</p>
            <button onClick={loadHistory} className="p-2 rounded-xl text-gray-500 hover:text-white hover:bg-white/[0.05] transition-colors">
              <RefreshCw className="size-4" />
            </button>
          </div>

          {loadingHistory ? (
            <div className="py-16 text-center text-gray-600">
              <div className="size-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              Loading…
            </div>
          ) : history.length === 0 ? (
            <div className="py-16 text-center">
              <CheckCircle2 className="size-10 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-600 font-bold">No requests yet</p>
              <p className="text-gray-700 text-xs mt-1">Your submitted orders will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04] max-h-[60vh] overflow-y-auto kitchen-scroll">
              {history.map(order => {
                const st = STATUS_STYLE[order.status] ?? STATUS_STYLE.pending;
                return (
                  <div key={order.id} className="p-5 hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        <Clock className="size-3.5 text-gray-600 shrink-0" />
                        <span className="text-xs text-gray-500">
                          {new Date(order.created_at).toLocaleDateString('en-GB')} {new Date(order.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${st.cls}`}>
                        {st.label}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {order.items.map((item, i) => (
                        <p key={i} className="text-sm text-white">
                          <span className="text-orange-500 font-bold">•</span>{' '}
                          {item.name} — <span className="text-gray-400">{item.quantity} {item.unit}</span>
                        </p>
                      ))}
                    </div>
                    {order.notes && (
                      <p className="text-xs text-amber-400/80 italic mt-2 bg-amber-500/10 px-3 py-2 rounded-xl border border-amber-900/20">
                        {order.notes}
                      </p>
                    )}
                    {/* Resend WhatsApp */}
                    <button
                      onClick={() => {
                        const msg = buildWhatsAppMessage({
                          name: order.requested_by_name,
                          role: order.role,
                          items: order.items,
                          notes: order.notes,
                          branchId: order.branch_id,
                        });
                        sendWhatsApp(msg);
                      }}
                      className="mt-3 flex items-center gap-1.5 text-xs text-green-400 hover:text-green-300 font-bold transition-colors"
                    >
                      <Send className="size-3" /> Resend to WhatsApp
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
