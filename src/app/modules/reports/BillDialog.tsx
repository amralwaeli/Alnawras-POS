import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { usePOS } from '../../context/POSContext';
import { permissionsFor } from '../../models/types';
import { fmt } from '../../../lib/currency';
import { friendlyError } from '../../../lib/errors';
import { ReportsController as RC, BillDetail, RefundMethod } from '../../controllers/ReportsController';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { refundEstimate } from './refund';

const time = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const METHODS: [RefundMethod, string][] = [['cash', 'Cash'], ['card', 'Card'], ['qr', 'QR'], ['account', 'Account']];

/** Full bill (items, who added / cancelled them, payments, refunds), fetched only when opened.
 *  Staff who take payments can refund the whole bill or chosen items from here. */
export function BillDialog({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const { currentUser } = usePOS();
  const canRefund = !!currentUser && permissionsFor(currentUser).canProcessPayments;
  const [bill, setBill] = useState<BillDetail | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [refunding, setRefunding] = useState(false);
  const [whole, setWhole] = useState(true);
  const [chosen, setChosen] = useState<string[]>([]);
  const [method, setMethod] = useState<RefundMethod>('cash');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    setBill(null); setError(''); setRefunding(false);
    RC.getBillDetail(orderId).then(res => {
      if (cancelled) return;
      if (res.success) setBill(res.data!); else setError(friendlyError(res.error, 'Could not load the bill'));
    });
    return () => { cancelled = true; };
  }, [orderId, reload]);

  const b = bill;
  const refunded = b ? b.refunds.reduce((s, r) => s + r.amount, 0) : 0;
  const left = b ? b.items.filter(i => !i.cancelled && !i.refundId) : [];
  const canStillRefund = canRefund && !!b && left.length > 0 && b.total - refunded > 0.005;
  const estimate = b ? refundEstimate(b.total, refunded, b.items, whole ? null : chosen) : 0;

  const startRefund = () => {
    const pm = b?.paymentMethod ?? '';
    setMethod((METHODS.some(([m]) => m === pm) ? pm : 'cash') as RefundMethod);   // 'split' bills default to cash
    setWhole(true); setChosen([]); setReason(''); setRefunding(true);
  };

  const confirm = async () => {
    if (!whole && !chosen.length) return toast.error('Choose the items to refund');
    if (!reason.trim()) return toast.error('Write the reason for the refund');
    setSaving(true);
    const res = await RC.refundBill({
      branchId: currentUser!.branchId, orderId: orderId!, itemIds: whole ? null : chosen, method,
      reason: reason.trim(), actorId: currentUser!.id, actorName: currentUser!.name,
    });
    setSaving(false);
    if (!res.success) return toast.error(friendlyError(res.error));
    toast.success(`Refunded ${fmt(res.data!.amount)}`);
    setReload(n => n + 1);
  };

  const input = 'w-full min-h-11 px-3 border border-gray-200 rounded-xl text-sm bg-white';
  return (
    <Dialog open={!!orderId} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base pr-6">
            {b ? `Bill #${b.billNumber ?? '—'} · ${b.orderType === 'dine-in' ? `Table ${b.tableNumber}` : b.orderType}${b.completedAt ? ` · paid ${time(b.completedAt)}` : ''}` : 'Bill'}
          </DialogTitle>
        </DialogHeader>
        {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : !b ? <p className="text-sm text-gray-500">Loading…</p> : refunding ? (
          <div className="space-y-4 text-sm min-w-0">
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Refund</legend>
              {([[true, 'Whole bill'], [false, 'Chosen items']] as const).map(([v, label]) => (
                <label key={label} className="flex items-center gap-2 min-h-11 cursor-pointer">
                  <input type="radio" name="refund-scope" checked={whole === v} onChange={() => setWhole(v)} className="size-4" />
                  {label}
                </label>
              ))}
            </fieldset>
            {!whole && (
              <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
                {left.map(i => (
                  <li key={i.id}>
                    <label className="flex items-center gap-3 px-3 min-h-11 cursor-pointer">
                      <input type="checkbox" className="size-4" checked={chosen.includes(i.id)}
                        onChange={e => setChosen(c => e.target.checked ? [...c, i.id] : c.filter(x => x !== i.id))} />
                      <span className="flex-1 min-w-0 break-words" dir="auto">{i.quantity} x {i.productName}</span>
                      <span className="whitespace-nowrap">{fmt(i.amount)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <label className="block space-y-1">
              <span className="text-gray-600">Money given back by</span>
              <select value={method} onChange={e => setMethod(e.target.value as RefundMethod)} className={input}>
                {METHODS.map(([m, label]) => <option key={m} value={m}>{label}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-gray-600">Reason (required)</span>
              <input type="text" value={reason} onChange={e => setReason(e.target.value)} className={input} dir="auto" required />
            </label>
            <p className="flex justify-between font-bold text-gray-900"><span>Refund about</span><span className="whitespace-nowrap">{fmt(estimate)}</span></p>
            <div className="flex gap-2">
              <button onClick={() => setRefunding(false)} disabled={saving}
                className="flex-1 min-h-11 rounded-xl border border-gray-200 font-semibold text-gray-700 hover:bg-gray-50">Back</button>
              <button onClick={confirm} disabled={saving || estimate <= 0}
                className="flex-1 min-h-11 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 disabled:opacity-50">
                {saving ? 'Refunding…' : 'Confirm refund'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-sm min-w-0">
            <p className="text-gray-600">Cashier <b dir="auto">{b.cashierName ?? '—'}</b> · <span className="uppercase">{b.paymentMethod ?? '—'}</span></p>
            <ul className="divide-y divide-gray-100">
              {b.items.map(i => {
                const off = i.cancelled || !!i.refundId;
                return (
                  <li key={i.id} className={`py-2 flex justify-between gap-3 ${off ? 'text-gray-400' : 'text-gray-900'}`}>
                    <div className="min-w-0">
                      <p className={`font-medium break-words ${off ? 'line-through' : ''}`} dir="auto">{i.quantity} x {i.productName}</p>
                      {i.modifiers && <p className="text-xs text-gray-500 break-words" dir="auto">{i.modifiers}</p>}
                      <p className="text-xs text-gray-500" dir="auto">by {i.addedBy ?? 'Guest / QR'}</p>
                      {i.cancelled && <p className="text-xs" dir="auto">Cancelled{i.cancelledBy ? ` by ${i.cancelledBy}` : ''}{i.cancelReason ? ` — ${i.cancelReason}` : ''}</p>}
                      {i.refundId && <p className="text-xs font-semibold text-red-600">Refunded</p>}
                    </div>
                    <span className={`whitespace-nowrap ${off ? 'line-through' : 'font-semibold'}`}>{fmt(i.amount)}</span>
                  </li>
                );
              })}
            </ul>
            <dl className="space-y-1 border-t border-gray-100 pt-3">
              {([['Subtotal', b.subtotal], ['Discount', -b.discount], ['Tax', b.tax]] as const).map(([k, v]) => (
                <div key={k} className="flex justify-between text-gray-600"><dt>{k}</dt><dd className="whitespace-nowrap">{fmt(v)}</dd></div>
              ))}
              <div className="flex justify-between font-bold text-gray-900"><dt>Total</dt><dd className="whitespace-nowrap">{fmt(b.total)}</dd></div>
            </dl>
            {b.payments.length > 0 && (
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Payments</p>
                <ul className="space-y-1">
                  {b.payments.map((p, n) => (
                    <li key={n} className="flex justify-between gap-3 text-gray-600">
                      <span className="min-w-0 break-words"><b className="uppercase">{p.method}</b> · <span dir="auto">{p.cashierName ?? '—'}</span> · {time(p.at)}</span>
                      <span className="whitespace-nowrap font-semibold text-gray-900">{fmt(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {b.refunds.length > 0 && (
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1">Refunds</p>
                <ul className="space-y-1">
                  {b.refunds.map((r, n) => (
                    <li key={n} className="flex justify-between gap-3 text-gray-600">
                      <span className="min-w-0 break-words"><b className="uppercase">{r.method}</b> · <span dir="auto">{r.by ?? '—'}</span> · {time(r.at)}
                        {r.reason && <span className="block text-xs" dir="auto">{r.reason}</span>}</span>
                      <span className="whitespace-nowrap font-semibold text-red-600">−{fmt(r.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {canStillRefund && (
              <button onClick={startRefund} className="w-full min-h-11 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700">Refund</button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
