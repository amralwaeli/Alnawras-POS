/**
 * PickupBoardView.tsx
 *
 * Staff hub for pickup orders: verify online payments (approve/reject the
 * receipt), advance Preparing → Ready → Picked, and (admin) upload the
 * merchant payment QR. Cash payments are collected on the Tables screen via the
 * normal cashier flow; this board manages the pickup-specific lifecycle.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { usePOS } from '../../context/POSContext';
import { PickupController } from '../../controllers/PickupController';
import { uploadMerchantQr } from '../../services/PickupService';
import { validateUpload, IMAGE_TYPES, MB } from '../../../lib/upload';
import { Order } from '../../models/types';
import { fmt } from '../../../lib/currency';
import { toast } from 'sonner';
import {
  Package, RefreshCw, CheckCircle2, XCircle, Clock, Bike, Truck, Store,
  Image as ImageIcon, QrCode, ChefHat, BadgeCheck, ArrowLeft,
} from 'lucide-react';

const methodIcon: Record<string, any> = { grab: Bike, lalamove: Truck, self: Store };
const methodLabel: Record<string, string> = { grab: 'Grab Express', lalamove: 'Lalamove', self: 'Self Pickup' };

const payBadge: Record<string, string> = {
  paid: 'bg-emerald-100 text-emerald-700',
  pending_verification: 'bg-amber-100 text-amber-700',
  rejected: 'bg-red-100 text-red-700',
  unpaid: 'bg-gray-100 text-gray-600',
};
const statusBadge: Record<string, string> = {
  preparing: 'bg-blue-100 text-blue-700',
  ready: 'bg-emerald-100 text-emerald-700',
  picked: 'bg-gray-100 text-gray-500',
};

export function PickupBoardView() {
  const { currentUser } = usePOS();
  const navigate = useNavigate();
  const branchId = currentUser?.branchId ?? 'branch-1';
  const actor = { id: currentUser?.id, name: currentUser?.name, branchId };
  const isAdmin = currentUser?.role === 'admin';
  // POS-only roles have no sidebar, so give them a way back.
  const noSidebar = ['kitchen', 'cashier', 'waiter', 'swaiter'].includes(currentUser?.role ?? '');

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [qrUploading, setQrUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await PickupController.getPickupOrders(branchId);
    if (res.success) setOrders(res.data);
    setLoading(false);
  }, [branchId]);

  useEffect(() => { load(); }, [load]);

  const run = async (id: string, fn: () => Promise<{ success: boolean; error?: string }>, ok: string) => {
    setBusy(id);
    const res = await fn();
    setBusy(null);
    if (res.success) { toast.success(ok); load(); }
    else toast.error(res.error || 'Action failed');
  };

  const uploadQr = async (file: File) => {
    const verr = validateUpload(file, IMAGE_TYPES, 5 * MB);
    if (verr) { toast.error(verr); return; }
    setQrUploading(true);
    const res = await uploadMerchantQr(branchId, file);
    setQrUploading(false);
    if ('url' in res) toast.success('Payment QR set');
    else if (res.alreadyExists) {
      toast.error('A payment QR is already set. To replace it, delete the old one in the Supabase Storage dashboard first.');
    } else {
      toast.error(res.error || 'QR upload failed');
    }
  };

  const active = orders.filter(o => o.pickupStatus !== 'picked');
  const completed = orders.filter(o => o.pickupStatus === 'picked');

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto bg-gray-50">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {noSidebar && (
            <button onClick={() => navigate(-1)} className="p-2 rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"><ArrowLeft className="size-5" /></button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Package className="size-6 text-orange-500" /> Pickup Orders</h1>
            <p className="text-sm text-gray-500 mt-0.5">{active.length} active · {completed.length} collected today</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-50">
              <QrCode className="size-4 text-orange-500" /> {qrUploading ? 'Uploading…' : 'Upload Payment QR'}
              <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadQr(f); }} />
            </label>
          )}
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50">
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><RefreshCw className="size-6 text-orange-500 animate-spin" /></div>
      ) : active.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Package className="size-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No active pickup orders</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {active.map(o => {
            const MIcon = methodIcon[o.pickupMethod ?? 'self'] ?? Store;
            const pending = o.pickupPayType === 'online' && o.paymentStatus === 'pending_verification';
            const canAdvance = o.pickupPayType === 'cash' || o.paymentStatus === 'paid';
            return (
              <div key={o.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-gray-900">{o.customerName || 'Customer'}</p>
                    <p className="text-xs text-gray-400">{o.customerPhone} · #{o.billNumber ?? '—'}</p>
                  </div>
                  <span className="flex items-center gap-1 text-xs font-bold text-gray-600"><MIcon className="size-3.5" /> {methodLabel[o.pickupMethod ?? 'self']}</span>
                </div>

                <div className="bg-gray-50 rounded-xl p-2.5 space-y-1 max-h-32 overflow-y-auto">
                  {(o.items ?? []).map(it => (
                    <div key={it.id} className="flex justify-between text-xs">
                      <span className="text-gray-700">{it.quantity}× {it.productName}{it.notes ? <em className="text-gray-400"> — {it.notes}</em> : ''}</span>
                      <span className="text-gray-500">{fmt((it.price ?? 0) * (it.quantity ?? 1))}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-gray-900">{fmt(o.total || 0)}</span>
                  <div className="flex gap-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${payBadge[o.paymentStatus ?? 'unpaid']}`}>
                      {o.pickupPayType === 'cash' ? 'CASH' : (o.paymentStatus ?? 'unpaid').replace('_', ' ').toUpperCase()}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadge[o.pickupStatus ?? 'preparing']}`}>{(o.pickupStatus ?? 'preparing').toUpperCase()}</span>
                  </div>
                </div>

                {/* Online payment verification */}
                {pending && (
                  <div className="space-y-2 border-t pt-3">
                    {o.paymentReceiptUrl && (
                      <button onClick={() => setReceipt(o.paymentReceiptUrl!)} className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold">
                        <ImageIcon className="size-4" /> View Receipt
                      </button>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <button disabled={busy === o.id} onClick={() => run(o.id, () => PickupController.approvePayment(o.id, actor), 'Payment approved')} className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-500 text-white text-xs font-bold disabled:opacity-50"><BadgeCheck className="size-4" /> Approve</button>
                      <button disabled={busy === o.id} onClick={() => run(o.id, () => PickupController.rejectPayment(o.id, actor), 'Payment rejected')} className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-500 text-white text-xs font-bold disabled:opacity-50"><XCircle className="size-4" /> Reject</button>
                    </div>
                  </div>
                )}

                {/* Status workflow */}
                {canAdvance && (
                  <div className="border-t pt-3">
                    {o.pickupStatus === 'preparing' && (
                      <button disabled={busy === o.id} onClick={() => run(o.id, () => PickupController.setPickupStatus(o.id, 'ready', actor), 'Marked Ready')} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50"><ChefHat className="size-4" /> Mark Ready</button>
                    )}
                    {o.pickupStatus === 'ready' && (
                      <button disabled={busy === o.id} onClick={() => run(o.id, () => PickupController.markPicked(o.id, actor), 'Marked Picked')} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold disabled:opacity-50"><CheckCircle2 className="size-4" /> Mark Picked</button>
                    )}
                    {o.pickupPayType === 'cash' && o.paymentStatus !== 'paid' && (
                      <p className="text-[11px] text-amber-600 mt-2 flex items-center gap-1"><Clock className="size-3" /> Collect cash at the counter (Tables screen).</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Receipt viewer */}
      {receipt && (
        <div className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4" onClick={() => setReceipt(null)}>
          <img src={receipt} alt="Payment receipt" className="max-h-[90vh] max-w-full rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
