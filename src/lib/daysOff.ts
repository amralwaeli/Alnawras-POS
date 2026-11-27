import { round2 } from './money';

// shortcut: same allowance for every restaurant and employee, make it a setting if one differs
export const DAYS_OFF_PER_MONTH = 2;

/** Days off above the monthly allowance are deducted at the daily rate (salary / 30). */
export function daysOffDeduction(daysOff: number, monthlySalary: number): { extraDays: number; deduction: number } {
  const extraDays = Math.max(0, daysOff - DAYS_OFF_PER_MONTH);
  return { extraDays, deduction: round2((extraDays * monthlySalary) / 30) };
}
