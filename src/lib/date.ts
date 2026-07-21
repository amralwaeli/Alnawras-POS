/**
 * Business-date helpers.
 *
 * Attendance and payroll reason about *calendar days* at the branch. The app
 * runs in a single business timezone, so the browser's LOCAL date is the
 * business date. `new Date().toISOString()` is UTC and rolls the date over
 * early for east-of-UTC zones (e.g. a 00:30 local check-in in UTC+8 lands on
 * the previous UTC day), which silently mis-attributes the day and then feeds
 * wrong present/absent counts into payroll. Use these instead.
 */

/** Local calendar-date string (YYYY-MM-DD) in the branch/browser timezone. */
export function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** First and last local calendar dates of a month (1-based month). */
export function monthDateRange(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  // Day 0 of the next month is the last day of this month, in local time.
  const end = localDateStr(new Date(year, month, 0));
  return { start, end };
}
