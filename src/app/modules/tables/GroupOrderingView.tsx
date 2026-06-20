/**
 * GroupOrderingView.tsx
 *
 * Customer page for multi-device GROUP ordering, reached via the stable table
 * QR (/#/order/t/:qrToken). Each device that scans joins the table's active
 * group as its own guest session, then orders into the shared table bill.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { joinTable, GuestSession } from '../../services/GroupOrderService';
import { SecureOrderingUI } from './SecureQROrderingView';
import { UtensilsCrossed, ShieldAlert } from 'lucide-react';

export function GroupOrderingView() {
  const { qrToken } = useParams<{ qrToken: string }>();
  const [state, setState] = useState<'loading' | 'valid' | 'invalid'>('loading');
  const [session, setSession] = useState<GuestSession | null>(null);

  useEffect(() => {
    (async () => {
      if (!qrToken) { setState('invalid'); return; }
      const s = await joinTable(qrToken);
      if (!s) { setState('invalid'); return; }
      setSession(s);
      setState('valid');
    })();
  }, [qrToken]);

  if (state === 'loading') {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#EAEEF3]">
        <div className="flex flex-col items-center gap-5">
          <div className="bg-orange-500 rounded-[28px] p-5 shadow-2xl shadow-orange-200"><UtensilsCrossed className="size-10 text-white" /></div>
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-black text-gray-400 uppercase tracking-[0.3em]">Joining table…</p>
        </div>
      </div>
    );
  }

  if (state === 'invalid' || !session) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#EAEEF3] px-4">
        <div className="bg-white rounded-[40px] shadow-2xl p-10 max-w-sm w-full text-center">
          <div className="bg-red-100 rounded-full p-4 w-fit mx-auto mb-5"><ShieldAlert className="size-10 text-red-500" /></div>
          <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight mb-2">Table Unavailable</h2>
          <p className="text-sm text-gray-400">This QR code is invalid, or the table session was closed. Please ask a team member or scan the table QR again.</p>
        </div>
      </div>
    );
  }

  return <SecureOrderingUI tableId={session.tableId} addedBy={session.sessionId} addedByName={session.guestLabel} />;
}
