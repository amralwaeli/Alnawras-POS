/**
 * Clock-in / clock-out rules (owner decision 2026-11-17, "choose the best"):
 * - Clock-in opens 30 min before the shift starts; minutes after the start are late.
 * - Overnight shifts (end before start, e.g. 22:00–06:00) work: the shift belongs to the
 *   day it starts, and a check-out after midnight closes yesterday's log.
 * - Clock-out is allowed any time up to 6 hours after the shift end (the old rule refused
 *   after 30 min and left logs open); overtime therefore counts for at most 6 hours.
 *   A scan later than that is a new check-in; the forgotten log stays open for a manager.
 */
export const EARLY_CHECK_IN_MIN = 30;
export const MAX_OVERTIME_MIN = 6 * 60;
export const DOUBLE_SCAN_MIN = 5;

const MIN = 60_000;
const toMins = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); };
const at = (day: Date, mins: number) => { const d = new Date(day); d.setHours(0, 0, 0, 0); d.setMinutes(mins); return d; };
export const clock = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** The start of the shift a check-in at `t` belongs to (today's, or yesterday's for an overnight shift still running). */
export function shiftStartFor(t: Date, shiftStart: string, shiftEnd: string): Date {
  const s = toMins(shiftStart), e = toMins(shiftEnd);
  const start = at(t, s);
  const overnight = e <= s;
  // 00:10 on an overnight 22:00–06:00 shift: that shift started yesterday.
  if (overnight && t.getHours() * 60 + t.getMinutes() < e + MAX_OVERTIME_MIN && t < new Date(start.getTime() - EARLY_CHECK_IN_MIN * MIN)) {
    start.setDate(start.getDate() - 1);
  }
  return start;
}

export function shiftEndFor(start: Date, shiftStart: string, shiftEnd: string): Date {
  const s = toMins(shiftStart), e = toMins(shiftEnd);
  const end = at(start, e);
  if (e <= s) end.setDate(end.getDate() + 1);
  return end;
}

export type CheckIn = { ok: true; logDate: Date; lateMinutes: number } | { ok: false; error: string };
export function checkInRule(now: Date, shiftStart: string, shiftEnd: string): CheckIn {
  const start = shiftStartFor(now, shiftStart, shiftEnd);
  const opens = new Date(start.getTime() - EARLY_CHECK_IN_MIN * MIN);
  if (now < opens) return { ok: false, error: `Too early. You can scan starting at ${clock(opens)}` };
  return { ok: true, logDate: start, lateMinutes: Math.max(0, Math.floor((now.getTime() - start.getTime()) / MIN)) };
}

export type CheckOut =
  | { ok: true; workedMinutes: number; earlyLeaveMinutes: number; overtimeMinutes: number }
  | { ok: false; error: string };
export function checkOutRule(now: Date, checkIn: Date, shiftStart: string, shiftEnd: string): CheckOut {
  const since = (now.getTime() - checkIn.getTime()) / MIN;
  if (since < DOUBLE_SCAN_MIN) return { ok: false, error: 'Recently clocked in. Please wait a few minutes before clocking out.' };
  const end = shiftEndFor(shiftStartFor(checkIn, shiftStart, shiftEnd), shiftStart, shiftEnd);
  const pastEnd = (now.getTime() - end.getTime()) / MIN;
  return {
    ok: true,
    workedMinutes: Math.round(since),
    earlyLeaveMinutes: Math.max(0, Math.round(-pastEnd)),
    overtimeMinutes: Math.min(MAX_OVERTIME_MIN, Math.max(0, Math.round(pastEnd))),
  };
}

/** Is a log checked in at `checkIn` still closable by a scan at `now`? */
export function stillOpen(now: Date, checkIn: Date, shiftStart: string, shiftEnd: string): boolean {
  const end = shiftEndFor(shiftStartFor(checkIn, shiftStart, shiftEnd), shiftStart, shiftEnd);
  return now.getTime() <= end.getTime() + MAX_OVERTIME_MIN * MIN;
}
