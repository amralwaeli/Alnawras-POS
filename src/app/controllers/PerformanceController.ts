import { supabase } from '../../lib/supabase';
import {
  Employee, PerformanceObservation, ObservationCategory, ObservationReviewStatus,
  Result, ROLE_PERMISSIONS, UserRole,
} from '../models/types';
import { mapEmployee, mapAttendanceLog, mapPerformanceObservation } from '../models/mappers';
import { localDateStr } from '../../lib/date';
import {
  summarizeEmployee, buildWeeklyTrend, resolveAiAttribution, validateObservationDraft,
  metricUnitFor, EmployeePerformanceSummary, TrendPoint, OrderActivityRow,
  PaymentActivityRow, AiObservationPayload, AttributionDecision,
} from '../models/performance';

// ─────────────────────────────────────────────────────────────────────────────
// PerformanceController
//
// Extends the existing HR system (WorkforceController / HRController). It
// READS employees, attendance_logs, order_items and order_payments exactly as
// they are, and WRITES only to employee_performance_observations (0026).
// It never writes to employees, users, attendance_logs or payroll_summary,
// and payroll never reads anything produced here.
// ─────────────────────────────────────────────────────────────────────────────

const TABLE = 'employee_performance_observations';
const PAGE = 1000;          // PostgREST's default max rows per request
const MAX_RANGE_DAYS = 93;  // keep overview queries bounded

const uid = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export interface PeriodRange { from: Date; to: Date }

/** Local-day bounds → timestamps, so "this month" means the business's month. */
function bounds(range: PeriodRange) {
  const start = new Date(range.from.getFullYear(), range.from.getMonth(), range.from.getDate());
  const end = new Date(range.to.getFullYear(), range.to.getMonth(), range.to.getDate(), 23, 59, 59, 999);
  return {
    startIso: start.toISOString(), endIso: end.toISOString(),
    startDate: localDateStr(start), endDate: localDateStr(end),
  };
}

function checkRange(range: PeriodRange): string | null {
  if (!(range.from instanceof Date) || !(range.to instanceof Date) || range.from > range.to) {
    return 'Invalid date range.';
  }
  const days = (range.to.getTime() - range.from.getTime()) / 86_400_000;
  return days > MAX_RANGE_DAYS ? `Please choose a period of ${MAX_RANGE_DAYS} days or less.` : null;
}

/** Pages through a query so large months are not silently truncated at 1000 rows. */
async function fetchAll<T = any>(build: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

const toOrderRow = (r: any): OrderActivityRow => ({
  orderId: r.order_id,
  tableId: r.orders?.table_id ?? null,
  itemStatus: r.status ?? undefined,
  addedBy: r.added_by,
  createdAt: new Date(r.created_at),
});

const toPaymentRow = (r: any): PaymentActivityRow => ({
  cashierId: r.cashier_id ?? null,
  createdAt: new Date(r.created_at),
});

/** Same permission that already gates the HR (workforce) module. */
function canReview(role: UserRole | string | undefined): boolean {
  return !!role && !!ROLE_PERMISSIONS[role as UserRole]?.canManageStaff;
}

export interface Reviewer { id: string; role: UserRole | string }

export class PerformanceController {

  // ── Team overview for the HR dashboard ─────────────────────────────────────
  static async getTeamPerformance(
    branchId: string,
    range: PeriodRange,
  ): Promise<Result<EmployeePerformanceSummary[]>> {
    const bad = checkRange(range);
    if (bad) return { success: false, error: bad };
    try {
      const b = bounds(range);
      const [empRes, attendance, items, payments, obs] = await Promise.all([
        supabase.from('employees').select('*')
          .eq('branch_id', branchId).eq('status', 'active').neq('role', 'admin')
          .order('full_name'),
        fetchAll(() => supabase.from('attendance_logs').select('*')
          .eq('branch_id', branchId).gte('log_date', b.startDate).lte('log_date', b.endDate)
          .order('id')),
        fetchAll(() => supabase.from('order_items')
          .select('order_id, status, added_by, created_at, orders(table_id)')
          .eq('branch_id', branchId).gte('created_at', b.startIso).lte('created_at', b.endIso)
          .order('id')),
        fetchAll(() => supabase.from('order_payments').select('cashier_id, created_at')
          .eq('branch_id', branchId).gte('created_at', b.startIso).lte('created_at', b.endIso)
          .order('id')),
        fetchAll(() => supabase.from(TABLE).select('*')
          .eq('branch_id', branchId).gte('observed_at', b.startIso).lte('observed_at', b.endIso)
          .order('id')),
      ]);
      if (empRes.error) throw empRes.error;

      const data = {
        attendance: attendance.map(mapAttendanceLog),
        orders: items.map(toOrderRow),
        payments: payments.map(toPaymentRow),
        observations: obs.map(mapPerformanceObservation),
      };
      return { success: true, data: (empRes.data ?? []).map((r: any) => summarizeEmployee(mapEmployee(r), data)) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ── One employee's indicators, trend and observation history ───────────────
  static async getEmployeePerformance(
    employee: Employee,
    range: PeriodRange,
  ): Promise<Result<{ summary: EmployeePerformanceSummary; trend: TrendPoint[]; observations: PerformanceObservation[] }>> {
    const bad = checkRange(range);
    if (bad) return { success: false, error: bad };
    try {
      const b = bounds(range);
      const userId = employee.userId;
      const [attendance, items, payments, obs] = await Promise.all([
        fetchAll(() => supabase.from('attendance_logs').select('*')
          .eq('employee_id', employee.employeeId)
          .gte('log_date', b.startDate).lte('log_date', b.endDate).order('id')),
        // POS activity is attributed ONLY through the employee's linked login.
        userId
          ? fetchAll(() => supabase.from('order_items')
              .select('order_id, status, added_by, created_at, orders(table_id)')
              .eq('added_by', userId).gte('created_at', b.startIso).lte('created_at', b.endIso).order('id'))
          : Promise.resolve([]),
        userId
          ? fetchAll(() => supabase.from('order_payments').select('cashier_id, created_at')
              .eq('cashier_id', userId).gte('created_at', b.startIso).lte('created_at', b.endIso).order('id'))
          : Promise.resolve([]),
        fetchAll(() => supabase.from(TABLE).select('*')
          .eq('employee_id', employee.employeeId)
          .gte('observed_at', b.startIso).lte('observed_at', b.endIso).order('id')),
      ]);

      const attendanceLogs = attendance.map(mapAttendanceLog);
      const orders = items.map(toOrderRow);
      const observations = obs.map(mapPerformanceObservation)
        .sort((a, z) => z.observedAt.getTime() - a.observedAt.getTime());

      const summary = summarizeEmployee(employee, {
        attendance: attendanceLogs, orders, payments: payments.map(toPaymentRow), observations,
      });
      const trend = buildWeeklyTrend({
        from: range.from, to: range.to, attendance: attendanceLogs, orders, userId, observations,
      });
      return { success: true, data: { summary, trend, observations } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ── Observation list (review queue, history) ───────────────────────────────
  static async listObservations(filters: {
    branchId: string;
    status?: ObservationReviewStatus | 'all';
    employeeId?: string;
    unattributedOnly?: boolean;
    limit?: number;
  }): Promise<Result<PerformanceObservation[]>> {
    try {
      let q = supabase.from(TABLE).select('*').eq('branch_id', filters.branchId);
      if (filters.status && filters.status !== 'all') q = q.eq('review_status', filters.status);
      if (filters.employeeId) q = q.eq('employee_id', filters.employeeId);
      if (filters.unattributedOnly) q = q.is('employee_id', null);
      const { data, error } = await q.order('observed_at', { ascending: false }).limit(filters.limit ?? 200);
      if (error) throw error;
      return { success: true, data: (data ?? []).map(mapPerformanceObservation) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ── Manager-entered observation (evaluation, complaint, compliment, note) ──
  // Entered by a human reviewer, so it is recorded as already verified.
  static async recordObservation(input: {
    employee: Pick<Employee, 'employeeId' | 'branchId'>;
    source: 'manager' | 'customer';
    category: ObservationCategory;
    summary: string;
    metricValue?: number;
    observedAt?: Date;
    reviewer: Reviewer;
  }): Promise<Result<PerformanceObservation>> {
    if (!canReview(input.reviewer.role)) {
      return { success: false, error: 'You do not have permission to record performance observations.' };
    }
    const invalid = validateObservationDraft(input);
    if (invalid) return { success: false, error: invalid };
    const now = new Date();
    const { data, error } = await supabase.from(TABLE).insert({
      id: uid('obs'),
      employee_id: input.employee.employeeId,
      branch_id: input.employee.branchId,
      source: input.source,
      category: input.category,
      observed_at: (input.observedAt ?? now).toISOString(),
      metric_value: input.metricValue ?? null,
      metric_unit: metricUnitFor(input.category) ?? null,
      summary: input.summary.trim(),
      review_status: 'verified',
      reviewed_by: input.reviewer.id,
      reviewed_at: now.toISOString(),
      created_by: input.reviewer.id,
    }).select().single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: mapPerformanceObservation(data) };
  }

  // ── AI CCTV ingestion ───────────────────────────────────────────────────────
  // Always lands as 'pending' (also forced by the DB trigger). If the employee
  // cannot be reliably identified it is stored UNATTRIBUTED for a manager to
  // assign — never guessed. The attribution decision is kept in the evidence.
  static async ingestAiObservation(
    payload: AiObservationPayload,
  ): Promise<Result<{ observation: PerformanceObservation; decision: AttributionDecision }>> {
    if (!payload.evidence || Object.keys(payload.evidence).length === 0) {
      return { success: false, error: 'AI observations must include evidence (camera / clip reference).' };
    }
    if (!payload.summary?.trim()) return { success: false, error: 'AI observation summary is required.' };
    if (payload.category === 'manager_evaluation') {
      return { success: false, error: 'AI cannot submit manager evaluations.' };
    }
    try {
      const { data: emps, error: empErr } = await supabase.from('employees')
        .select('employee_id, role, status, branch_id').eq('branch_id', payload.branchId);
      if (empErr) throw empErr;
      const decision = resolveAiAttribution(payload, (emps ?? []).map((e: any) => ({
        employeeId: e.employee_id, role: e.role, status: e.status, branchId: e.branch_id,
      })));

      const { data, error } = await supabase.from(TABLE).insert({
        id: uid('obs'),
        employee_id: decision.employeeId ?? null,
        branch_id: payload.branchId,
        source: 'ai_cctv',
        category: payload.category,
        observed_at: payload.observedAt.toISOString(),
        metric_value: payload.metricValue ?? null,
        metric_unit: metricUnitFor(payload.category) ?? null,
        summary: payload.summary.trim(),
        evidence: {
          ...payload.evidence,
          attribution: {
            requested_employee_id: payload.employeeId ?? null,
            outcome: decision.outcome,
            reason: decision.reason,
          },
        },
        confidence: payload.confidence ?? null,
        review_status: 'pending',
        created_by: payload.source ?? 'ai-cctv',
      }).select().single();
      if (error) throw error;
      return { success: true, data: { observation: mapPerformanceObservation(data), decision } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ── Manager review: verify / correct attribution / dismiss ─────────────────
  static async reviewObservation(
    id: string,
    review: {
      action: 'verify' | 'correct' | 'dismiss';
      reviewer: Reviewer;
      correctedEmployeeId?: string;
      note?: string;
    },
  ): Promise<Result<PerformanceObservation>> {
    if (!canReview(review.reviewer.role)) {
      return { success: false, error: 'You do not have permission to review performance observations.' };
    }
    try {
      const { data: rows, error: readErr } = await supabase.from(TABLE).select('*').eq('id', id).limit(1);
      if (readErr) throw readErr;
      const current = rows?.[0];
      if (!current) return { success: false, error: 'Observation not found.' };

      const update: Record<string, any> = {
        reviewed_by: review.reviewer.id,
        reviewed_at: new Date().toISOString(),
        review_note: review.note?.trim() || null,
      };
      if (review.action === 'verify') {
        if (!current.employee_id) {
          return { success: false, error: 'This observation is unattributed — assign the correct employee instead.' };
        }
        update.review_status = 'verified';
      } else if (review.action === 'correct') {
        if (!review.correctedEmployeeId) return { success: false, error: 'Choose the correct employee.' };
        update.employee_id = review.correctedEmployeeId;
        update.review_status = 'corrected';
      } else {
        update.review_status = 'dismissed';
      }

      const { data, error } = await supabase.from(TABLE).update(update).eq('id', id).select().single();
      if (error) throw error;
      return { success: true, data: mapPerformanceObservation(data) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
