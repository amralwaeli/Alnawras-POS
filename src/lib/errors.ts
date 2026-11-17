/**
 * Turn whatever went wrong into a sentence staff or customers can act on.
 * Messages our own database functions raise (RAISE EXCEPTION → code P0001) are
 * already written for people and pass through; technical database / network
 * errors are mapped by their code; anything else that still looks technical
 * becomes a generic message (the detail goes to the console for us).
 */
const BY_CODE: Record<string, string> = {
  '42501': "This device isn't allowed to do that. Ask an admin to sign it in again.",
  '23505': 'That already exists — use a different value.',
  '23503': "This is still linked to other records, so it can't be changed or removed.",
  '23514': 'Some of the details are not valid.',
  '23502': 'A required detail is missing.',
  '22P02': 'Some of the details are not valid.',
  'PGRST116': 'Not found — it may have been removed.',
  'PGRST301': 'Your session has expired. Please sign in again.',
};

const TECHNICAL = /violates|relation|column|syntax|PGRST|JWT|permission denied|duplicate key|null value|foreign key|function .*\(|schema cache|undefined|TypeError|fetch/i;
const NETWORK = /failed to fetch|networkerror|network request failed|load failed/i;

export const GENERIC_ERROR = 'Something went wrong. Please try again.';

export function friendlyError(err: unknown, fallback = GENERIC_ERROR): string {
  if (err == null || err === '') return fallback;
  const code = typeof err === 'object' ? String((err as any).code ?? '') : '';
  const message = typeof err === 'string' ? err : String((err as any).message ?? '');

  if (NETWORK.test(message) || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return 'No internet connection. Please check it and try again.';
  }
  if (code === 'P0001' && message) return message;                // our functions' own wording
  if (code && BY_CODE[code]) return BY_CODE[code];
  for (const [c, text] of Object.entries(BY_CODE)) {                // a code inside a plain string
    if (message.includes(c)) return text;
  }
  if (/permission denied/i.test(message)) return BY_CODE['42501'];
  if (/duplicate key|already exists/i.test(message)) return BY_CODE['23505'];
  if (!message || TECHNICAL.test(message)) {
    if (message) console.warn('[error]', err);
    return fallback;
  }
  return message;                                                   // already human (e.g. "PIN must be 4 digits")
}
