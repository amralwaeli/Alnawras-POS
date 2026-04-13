/** Malaysian Ringgit — change here to update the whole app */
export const CURRENCY = 'RM';

/** Compute the real order total from items (DB total may be 0 if items were
 *  inserted directly without updating the orders row). */
export function orderTotal(order: any): number {
  const dbTotal = Number(order?.total ?? 0);
  if (dbTotal > 0) return dbTotal;
  return (order?.items ?? []).reduce(
    (s: number, i: any) => s + Number(i.price ?? 0) * Number(i.quantity ?? 1),
    0
  );
}

export function orderSubtotal(order: any): number {
  const db = Number(order?.subtotal ?? 0);
  if (db > 0) return db;
  return orderTotal(order);
}

export function fmt(amount: number): string {
  return `${CURRENCY} ${amount.toFixed(2)}`;
}
