/**
 * Employee performance — pure calculation layer (no I/O).
 *
 * Extends the existing HR system: every number here is derived from data the
 * app ALREADY records (attendance_logs, order_items.added_by,
 * order_payments.cashier_id) plus reviewed rows from
 * employee_performance_observations (migration 0026).
 *
 * Attribution rules (no activity is credited without reliable evidence):
 *   * POS activity is matched to an employee ONLY via employees.user_id — the
 *     login that actually performed the action. Employees with no linked login
 *     get no POS metrics (shown as "not linked"), never a guess by name.
 *   * Observations only count once a manager has verified/corrected them.
 *   * AI observations that fail any attribution check stay unattributed for a
 *     manager to assign — they are never auto-assigned to a "closest match".
 *
 * Nothing here feeds payroll. Indicators are advisory.
 */
import type { Employee, PerformanceObservation, ObservationCategory } from './types';
import { localDateStr } from '../../lib/date';

// ─── Role relevance ───────────────────────────────────────────────────────────

export type MetricKey =
  | 'attendance'
  | 'ordersHandled'
  | 'itemsEntered'
  | 'tablesServed'
  | 'paymentsProcessed'
  | 'serviceResponse'
  | 'tableVisits'
  | 'tableCleaning'
  | 'customerFeedback'
  | 'managerEvaluation';

export const METRIC_LABELS: Record<MetricKey, string> = {
  attendance: 'Attendance & punctuality',
  ordersHandled: 'Orders handled',
  itemsEntered: 'Items entered',
  tablesServed: 'Tables served',
  paymentsProcessed: 'Payments processed',
  serviceResponse: 'Service response time',
  tableVisits: 'Table check-backs',
  tableCleaning: 'Table cleaning turnaround',
  customerFeedback: 'Customer feedback',
  managerEvaluation: 'Manager evaluation',
};

const FLOOR: MetricKey[] = [
  'attendance', 'ordersHandled', 'itemsEntered', 'tablesServed',
  'serviceResponse', 'tableVisits', 'tableCleaning', 'customerFeedback', 'managerEvaluation',
];

/** Which metrics are part of each role's actual job. Unknown roles get the safe minimum. */
export const ROLE_METRICS: Record<string, MetricKey[]> = {
  waiter: FLOOR,
  swaiter: FLOOR,
  cashier: ['attendance', 'paymentsProcessed', 'customerFeedback', 'managerEvaluation'],
  kitchen: ['attendance', 'customerFeedback', 'managerEvaluation'],
  juice: ['attendance', 'customerFeedback', 'managerEvaluation'],
  manager: ['attendance', 'customerFeedback', 'managerEvaluation'],
  supervisor: ['attendance', 'customerFeedback', 'managerEvaluation'],
  hr: ['attendance', 'managerEvaluation'],
  accounting: ['attendance', 'managerEvaluation'],
  staff: ['attendance', 'managerEvaluation'],
};
const DEFAULT_METRICS: MetricKey[] = ['attendance', 'managerEvaluation'];

export function relevantMetrics(role: string): MetricKey[] {
  return ROLE_METRICS[role] ?? DEFAULT_METRICS;
}

/** The metric an observation category feeds. 'other' is a free-form note, relevant to anyone. */
export const CATEGORY_METRIC: Record<ObservationCategory, MetricKey | null> = {
  service_response: 'serviceResponse',
  table_attendance: 'tableVisits',
  table_cleaning: 'tableCleaning',
  customer_complaint: 'customerFeedback',
  customer_compliment: 'customerFeedback',
  manager_evaluation: 'managerEvaluation',
  other: null,
};

export const CATEGORY_LABELS: Record<ObservationCategory, string> = {
  service_response: 'Service response',
  table_attendance: 'Table check-back',
  table_cleaning: 'Table cleaning',
  customer_complaint: 'Customer complaint',
  customer_compliment: 'Customer compliment',
  manager_evaluation: 'Manager evaluation',
  other: 'Other note',
};

export function isCategoryRelevant(role: string, category: ObservationCategory): boolean {
  const metric = CATEGORY_METRIC[category];
  return metric === null || relevantMetrics(role).includes(metric);
}

// ─── Attendance (reads the EXISTING computed fields; never recomputes them) ───

export interface AttendanceLike {
  logDate: string;
  checkInTime?: Date;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
}

export interface AttendanceSummary {
  daysPresent: number;
  lateArrivals: number;
  totalLateMinutes: number;
  avgLateMinutes: number;      // across late days only
  earlyLeaves: number;
  overtimeMinutes: number;
  /** on-time days / days present; null when there is nothing to measure. */
  punctualityRate: number | null;
}

export function summarizeAttendance(logs: AttendanceLike[]): AttendanceSummary {
  const present = logs.filter(l => l.checkInTime);
  const late = present.filter(l => (l.lateMinutes ?? 0) > 0);
  const totalLate = late.reduce((s, l) => s + l.lateMinutes, 0);
  return {
    daysPresent: present.length,
    lateArrivals: late.length,
    totalLateMinutes: totalLate,
    avgLateMinutes: late.length ? Math.round(totalLate / late.length) : 0,
    earlyLeaves: present.filter(l => (l.earlyLeaveMinutes ?? 0) > 0).length,
    overtimeMinutes: present.reduce((s, l) => s + (l.overtimeMinutes ?? 0), 0),
    punctualityRate: present.length ? (present.length - late.length) / present.length : null,
  };
}

// ─── POS activity ─────────────────────────────────────────────────────────────

/** One order_items row, flattened with its parent order's table. */
export interface OrderActivityRow {
  orderId: string;
  tableId?: string | null;
  itemStatus?: string;
  addedBy: string;        // users.id
  createdAt: Date;
}

export interface PaymentActivityRow {
  cashierId?: string | null;  // users.id
  createdAt: Date;
}

export interface OrderSummary {
  ordersHandled: number;
  itemsEntered: number;
  tablesServed: number;   // distinct dine-in orders (one order = one table seating)
}

export function summarizeOrders(rows: OrderActivityRow[], userId: string | undefined): OrderSummary {
  if (!userId) return { ordersHandled: 0, itemsEntered: 0, tablesServed: 0 };
  const mine = rows.filter(r => r.addedBy === userId && r.itemStatus !== 'cancelled');
  const orders = new Set(mine.map(r => r.orderId));
  const tableOrders = new Set(mine.filter(r => r.tableId).map(r => r.orderId));
  return { ordersHandled: orders.size, itemsEntered: mine.length, tablesServed: tableOrders.size };
}

export function countPayments(rows: PaymentActivityRow[], userId: string | undefined): number {
  if (!userId) return 0;
  return rows.filter(r => r.cashierId === userId).length;
}

// ─── Observations ─────────────────────────────────────────────────────────────

export const isCounted = (o: Pick<PerformanceObservation, 'reviewStatus'>) =>
  o.reviewStatus === 'verified' || o.reviewStatus === 'corrected';

export interface ObservationSummary {
  pending: number;
  counted: number;
  dismissed: number;
  avgServiceResponseSec: number | null;
  avgTableCleaningMin: number | null;
  tableVisits: number;
  complaints: number;
  compliments: number;
  avgEvaluation: number | null;
  evaluationCount: number;
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const values = (obs: PerformanceObservation[], cat: ObservationCategory) =>
  obs.filter(o => o.category === cat && typeof o.metricValue === 'number').map(o => o.metricValue as number);

/** Only manager-verified/corrected observations contribute to indicators. */
export function summarizeObservations(all: PerformanceObservation[]): ObservationSummary {
  const counted = all.filter(isCounted);
  return {
    pending: all.filter(o => o.reviewStatus === 'pending').length,
    counted: counted.length,
    dismissed: all.filter(o => o.reviewStatus === 'dismissed').length,
    avgServiceResponseSec: avg(values(counted, 'service_response')),
    avgTableCleaningMin: avg(values(counted, 'table_cleaning')),
    tableVisits: counted.filter(o => o.category === 'table_attendance').length,
    complaints: counted.filter(o => o.category === 'customer_complaint').length,
    compliments: counted.filter(o => o.category === 'customer_compliment').length,
    avgEvaluation: avg(values(counted, 'manager_evaluation')),
    evaluationCount: values(counted, 'manager_evaluation').length,
  };
}

// ─── Weekly trend ─────────────────────────────────────────────────────────────

export interface TrendPoint {
  weekStart: string;  // local YYYY-MM-DD (Monday)
  daysPresent: number;
  lateArrivals: number;
  ordersHandled: number;
  compliments: number;
  complaints: number;
}

/** Monday of the local week containing `d`. */
export function weekStart(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (x.getDay() + 6) % 7; // Mon=0 … Sun=6
  x.setDate(x.getDate() - offset);
  return localDateStr(x);
}

function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function buildWeeklyTrend(input: {
  from: Date; to: Date;
  attendance: AttendanceLike[];
  orders: OrderActivityRow[];
  userId?: string;
  observations: PerformanceObservation[];
}): TrendPoint[] {
  const points = new Map<string, TrendPoint>();
  const cursor = parseLocalDate(weekStart(input.from));
  while (cursor <= input.to) {
    const key = localDateStr(cursor);
    points.set(key, { weekStart: key, daysPresent: 0, lateArrivals: 0, ordersHandled: 0, compliments: 0, complaints: 0 });
    cursor.setDate(cursor.getDate() + 7);
  }

  for (const l of input.attendance) {
    if (!l.checkInTime) continue;
    const p = points.get(weekStart(parseLocalDate(l.logDate)));
    if (!p) continue;
    p.daysPresent++;
    if (l.lateMinutes > 0) p.lateArrivals++;
  }

  if (input.userId) {
    const seen = new Map<string, Set<string>>();
    for (const r of input.orders) {
      if (r.addedBy !== input.userId || r.itemStatus === 'cancelled') continue;
      const key = weekStart(r.createdAt);
      if (!points.has(key)) continue;
      if (!seen.has(key)) seen.set(key, new Set());
      seen.get(key)!.add(r.orderId);
    }
    seen.forEach((ids, key) => { points.get(key)!.ordersHandled = ids.size; });
  }

  for (const o of input.observations) {
    if (!isCounted(o)) continue;
    const p = points.get(weekStart(o.observedAt));
    if (!p) continue;
    if (o.category === 'customer_compliment') p.compliments++;
    if (o.category === 'customer_complaint') p.complaints++;
  }

  return Array.from(points.values());
}

// ─── Team overview ────────────────────────────────────────────────────────────

export interface EmployeePerformanceSummary {
  employee: Employee;
  metrics: MetricKey[];
  /** false when the employee has no linked POS login → POS metrics unavailable. */
  posLinked: boolean;
  attendance: AttendanceSummary;
  orders: OrderSummary;
  paymentsProcessed: number;
  observations: ObservationSummary;
}

export function summarizeEmployee(
  employee: Employee,
  data: {
    attendance: (AttendanceLike & { employeeId: string })[];
    orders: OrderActivityRow[];
    payments: PaymentActivityRow[];
    observations: PerformanceObservation[];
  },
): EmployeePerformanceSummary {
  const metrics = relevantMetrics(employee.role);
  return {
    employee,
    metrics,
    posLinked: !!employee.userId,
    attendance: summarizeAttendance(data.attendance.filter(a => a.employeeId === employee.employeeId)),
    orders: summarizeOrders(data.orders, employee.userId),
    paymentsProcessed: countPayments(data.payments, employee.userId),
    observations: summarizeObservations(data.observations.filter(o => o.employeeId === employee.employeeId)),
  };
}

// ─── Input validation ─────────────────────────────────────────────────────────

export const MIN_AI_CONFIDENCE = 0.8;

export interface ObservationDraft {
  category: ObservationCategory;
  summary: string;
  metricValue?: number;
}

/** Returns an error message, or null when the draft is valid. */
export function validateObservationDraft(d: ObservationDraft): string | null {
  if (!d.summary || !d.summary.trim()) return 'A short description is required.';
  if (d.category === 'manager_evaluation') {
    if (!Number.isInteger(d.metricValue) || d.metricValue! < 1 || d.metricValue! > 5) {
      return 'Evaluation rating must be a whole number from 1 to 5.';
    }
  }
  if (d.category === 'service_response' || d.category === 'table_cleaning') {
    if (typeof d.metricValue !== 'number' || !(d.metricValue > 0)) {
      return d.category === 'service_response'
        ? 'Response time (seconds) must be greater than 0.'
        : 'Cleaning turnaround (minutes) must be greater than 0.';
    }
  }
  return null;
}

export function metricUnitFor(category: ObservationCategory): PerformanceObservation['metricUnit'] {
  switch (category) {
    case 'service_response': return 'seconds';
    case 'table_cleaning': return 'minutes';
    case 'manager_evaluation': return 'rating';
    default: return undefined;
  }
}

// ─── AI attribution (no evidence → no attribution) ────────────────────────────

export interface AiObservationPayload {
  branchId: string;
  category: ObservationCategory;
  observedAt: Date;
  summary: string;
  /** employees.employee_id the AI believes it saw; omit when unsure. */
  employeeId?: string;
  confidence?: number;
  metricValue?: number;
  evidence: Record<string, unknown>;
  source?: string;  // integration name, e.g. 'cctv-vendor-x'
}

export interface AttributionDecision {
  employeeId?: string;
  outcome: 'attributed' | 'unattributed';
  reason: string;
}

export function resolveAiAttribution(
  payload: Pick<AiObservationPayload, 'employeeId' | 'confidence' | 'category' | 'branchId'>,
  employees: Pick<Employee, 'employeeId' | 'role' | 'status' | 'branchId'>[],
): AttributionDecision {
  if (!payload.employeeId) {
    return { outcome: 'unattributed', reason: 'AI did not identify an employee.' };
  }
  const emp = employees.find(e => e.employeeId === payload.employeeId && e.branchId === payload.branchId);
  if (!emp) {
    return { outcome: 'unattributed', reason: `Employee ${payload.employeeId} is not on this branch's HR records.` };
  }
  if (emp.status !== 'active') {
    return { outcome: 'unattributed', reason: `Employee ${payload.employeeId} is inactive.` };
  }
  if (typeof payload.confidence !== 'number' || payload.confidence < MIN_AI_CONFIDENCE) {
    return {
      outcome: 'unattributed',
      reason: `Identification confidence ${payload.confidence ?? 'unknown'} is below ${MIN_AI_CONFIDENCE}.`,
    };
  }
  if (!isCategoryRelevant(emp.role, payload.category)) {
    return { outcome: 'unattributed', reason: `"${payload.category}" is not part of the ${emp.role} role.` };
  }
  return { employeeId: emp.employeeId, outcome: 'attributed', reason: 'Identified with sufficient confidence.' };
}
