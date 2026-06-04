/** Generate a collision-safe unique ID using the Web Crypto API. */
export function genId(prefix?: string): string {
  const uuid = crypto.randomUUID();
  return prefix ? `${prefix}-${uuid}` : uuid;
}
