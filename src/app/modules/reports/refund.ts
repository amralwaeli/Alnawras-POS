import { round2 } from '../../../lib/money';

/** What a refund should come to — the same formula the refund_order RPC uses (migration 0059):
 *  the whole remaining bill = total − refunded so far; chosen items = their share of the total
 *  (by subtotal of all non-cancelled items). The last refund takes exactly what is left. */
export function refundEstimate(
  total: number,
  refundedSoFar: number,
  items: { id: string; amount: number; cancelled: boolean; refundId: string | null }[],
  chosen: string[] | null,
): number {
  const remaining = round2(total - refundedSoFar);
  const live = items.filter(i => !i.cancelled);
  const left = live.filter(i => !i.refundId);
  if (chosen === null || (left.length > 0 && left.every(i => chosen.includes(i.id)))) return Math.max(0, remaining);
  const all = live.reduce((s, i) => s + i.amount, 0);
  const part = left.filter(i => chosen.includes(i.id)).reduce((s, i) => s + i.amount, 0);
  return all > 0 ? Math.min(remaining, round2(total * part / all)) : 0;
}
