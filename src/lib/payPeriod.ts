import { localDateStr } from './date';

// shortcut: same pay day for every restaurant, make it a branch setting if one pays on another day
export const PAY_DAY = 7;

/** Salary-advance window for payroll month M (1-based): the 8th of M to the 7th of M+1, inclusive. */
export function payPeriodForPayroll(year: number, month: number): { from: string; to: string } {
  return {
    from: localDateStr(new Date(year, month - 1, PAY_DAY + 1)),
    to: localDateStr(new Date(year, month, PAY_DAY)), // Date rolls month 12 into January next year
  };
}

/** The pay period whose payday is the next PAY_DAY on or after `today`. */
export function currentPayPeriod(today: Date): { from: string; to: string; payday: Date } {
  const offset = today.getDate() <= PAY_DAY ? 1 : 0;
  const payday = new Date(today.getFullYear(), today.getMonth() + 1 - offset, PAY_DAY);
  // payday.getMonth() (0-based) is the 1-based payroll month before it; 0 rolls back to last December.
  return { ...payPeriodForPayroll(payday.getFullYear(), payday.getMonth()), payday };
}
