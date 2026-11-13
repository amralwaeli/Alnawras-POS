import { describe, it, expect } from 'vitest';
import {
  relevantMetrics, isCategoryRelevant, summarizeAttendance, summarizeOrders, countPayments,
  summarizeObservations, buildWeeklyTrend, weekStart, validateObservationDraft,
  resolveAiAttribution, summarizeEmployee, MIN_AI_CONFIDENCE, OrderActivityRow,
} from './performance';
import type { Employee, PerformanceObservation } from './types';

const obs = (p: Partial<PerformanceObservation>): PerformanceObservation => ({
  id: Math.random().toString(36), branchId: 'b1', source: 'manager', category: 'other',
  observedAt: new Date(2026, 10, 3, 12), summary: 's', reviewStatus: 'verified',
  createdAt: new Date(), ...p,
});

const emp = (p: Partial<Employee>): Employee => ({
  id: 'x', employeeId: 'EMP-001', fullName: 'A', role: 'waiter', monthlySalary: 0,
  shiftStart: '09:00', shiftEnd: '17:00', earlyCheckinMinutes: 5, lateCheckoutMinutes: 5,
  status: 'active', branchId: 'b1', createdAt: new Date(), updatedAt: new Date(), ...p,
});

describe('role relevance', () => {
  it('gives floor staff the service metrics and back-office only attendance + evaluation', () => {
    expect(relevantMetrics('waiter')).toEqual(expect.arrayContaining(['ordersHandled', 'tableCleaning', 'serviceResponse']));
    expect(relevantMetrics('hr')).toEqual(['attendance', 'managerEvaluation']);
    expect(relevantMetrics('accounting')).not.toContain('ordersHandled');
  });

  it('only cashiers get payments; cashiers do not get table cleaning', () => {
    expect(relevantMetrics('cashier')).toContain('paymentsProcessed');
    expect(relevantMetrics('waiter')).not.toContain('paymentsProcessed');
    expect(isCategoryRelevant('cashier', 'table_cleaning')).toBe(false);
    expect(isCategoryRelevant('waiter', 'table_cleaning')).toBe(true);
  });

  it('falls back to a safe minimum for unknown roles, and "other" notes apply to everyone', () => {
    expect(relevantMetrics('mystery')).toEqual(['attendance', 'managerEvaluation']);
    expect(isCategoryRelevant('mystery', 'other')).toBe(true);
    expect(isCategoryRelevant('kitchen', 'service_response')).toBe(false);
  });
});

describe('summarizeAttendance (reads existing computed fields)', () => {
  it('counts present, late, early leave, overtime and punctuality', () => {
    const s = summarizeAttendance([
      { logDate: '2026-11-02', checkInTime: new Date(), lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 30 },
      { logDate: '2026-11-03', checkInTime: new Date(), lateMinutes: 10, earlyLeaveMinutes: 0, overtimeMinutes: 0 },
      { logDate: '2026-11-04', checkInTime: new Date(), lateMinutes: 20, earlyLeaveMinutes: 15, overtimeMinutes: 0 },
      { logDate: '2026-11-05', lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0 }, // no check-in
    ]);
    expect(s).toEqual({
      daysPresent: 3, lateArrivals: 2, totalLateMinutes: 30, avgLateMinutes: 15,
      earlyLeaves: 1, overtimeMinutes: 30, punctualityRate: 1 / 3,
    });
  });

  it('returns null punctuality when there is nothing to measure', () => {
    expect(summarizeAttendance([]).punctualityRate).toBeNull();
  });
});

describe('POS activity attribution', () => {
  const rows: OrderActivityRow[] = [
    { orderId: 'o1', tableId: 't1', addedBy: 'u1', createdAt: new Date() },
    { orderId: 'o1', tableId: 't1', addedBy: 'u1', createdAt: new Date() },
    { orderId: 'o2', tableId: null, addedBy: 'u1', createdAt: new Date() },
    { orderId: 'o3', tableId: 't2', addedBy: 'u1', itemStatus: 'cancelled', createdAt: new Date() },
    { orderId: 'o3', tableId: 't2', addedBy: 'u2', createdAt: new Date() },
  ];

  it('credits only the login that entered the item, excluding voided items', () => {
    expect(summarizeOrders(rows, 'u1')).toEqual({ ordersHandled: 2, itemsEntered: 3, tablesServed: 1 });
    expect(summarizeOrders(rows, 'u2')).toEqual({ ordersHandled: 1, itemsEntered: 1, tablesServed: 1 });
  });

  it('attributes nothing to an employee with no linked login', () => {
    expect(summarizeOrders(rows, undefined)).toEqual({ ordersHandled: 0, itemsEntered: 0, tablesServed: 0 });
    expect(countPayments([{ cashierId: null, createdAt: new Date() }], undefined)).toBe(0);
  });

  it('counts payments by cashier id', () => {
    const p = [{ cashierId: 'c1', createdAt: new Date() }, { cashierId: 'c1', createdAt: new Date() }, { cashierId: 'c2', createdAt: new Date() }];
    expect(countPayments(p, 'c1')).toBe(2);
  });
});

describe('summarizeObservations', () => {
  it('counts only verified/corrected rows towards indicators', () => {
    const s = summarizeObservations([
      obs({ category: 'customer_compliment' }),
      obs({ category: 'customer_complaint', reviewStatus: 'dismissed' }),
      obs({ category: 'customer_complaint', reviewStatus: 'pending', source: 'ai_cctv' }),
      obs({ category: 'service_response', metricValue: 40, reviewStatus: 'corrected' }),
      obs({ category: 'service_response', metricValue: 999, reviewStatus: 'pending' }),
      obs({ category: 'service_response', metricValue: 60 }),
      obs({ category: 'manager_evaluation', metricValue: 4 }),
      obs({ category: 'manager_evaluation', metricValue: 5 }),
      obs({ category: 'table_attendance' }),
    ]);
    expect(s.complaints).toBe(0);
    expect(s.compliments).toBe(1);
    expect(s.pending).toBe(2);
    expect(s.dismissed).toBe(1);
    expect(s.avgServiceResponseSec).toBe(50);
    expect(s.avgEvaluation).toBe(4.5);
    expect(s.evaluationCount).toBe(2);
    expect(s.tableVisits).toBe(1);
    expect(s.avgTableCleaningMin).toBeNull();
  });
});

describe('weekly trend', () => {
  it('uses Monday as the local week start', () => {
    expect(weekStart(new Date(2026, 10, 13))).toBe('2026-11-09'); // Fri → Mon
    expect(weekStart(new Date(2026, 10, 15))).toBe('2026-11-09'); // Sun → previous Mon
    expect(weekStart(new Date(2026, 10, 16))).toBe('2026-11-16'); // Mon → itself
  });

  it('buckets attendance, orders and verified feedback per week', () => {
    const t = buildWeeklyTrend({
      from: new Date(2026, 10, 1), to: new Date(2026, 10, 16),
      attendance: [
        { logDate: '2026-11-03', checkInTime: new Date(), lateMinutes: 5, earlyLeaveMinutes: 0, overtimeMinutes: 0 },
        { logDate: '2026-11-10', checkInTime: new Date(), lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0 },
      ],
      orders: [
        { orderId: 'o1', addedBy: 'u1', createdAt: new Date(2026, 10, 10, 12) },
        { orderId: 'o1', addedBy: 'u1', createdAt: new Date(2026, 10, 10, 13) },
        { orderId: 'o2', addedBy: 'u9', createdAt: new Date(2026, 10, 10, 13) },
      ],
      userId: 'u1',
      observations: [
        obs({ category: 'customer_compliment', observedAt: new Date(2026, 10, 11) }),
        obs({ category: 'customer_complaint', observedAt: new Date(2026, 10, 11), reviewStatus: 'pending' }),
      ],
    });
    expect(t.map(p => p.weekStart)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']);
    const w2 = t.find(p => p.weekStart === '2026-11-02')!;
    const w3 = t.find(p => p.weekStart === '2026-11-09')!;
    expect(w2).toMatchObject({ daysPresent: 1, lateArrivals: 1, ordersHandled: 0 });
    expect(w3).toMatchObject({ daysPresent: 1, lateArrivals: 0, ordersHandled: 1, compliments: 1, complaints: 0 });
  });
});

describe('validateObservationDraft', () => {
  it('requires a description', () => {
    expect(validateObservationDraft({ category: 'other', summary: '  ' })).toMatch(/description/);
  });
  it('enforces a 1–5 whole-number rating for evaluations', () => {
    expect(validateObservationDraft({ category: 'manager_evaluation', summary: 'x', metricValue: 6 })).toMatch(/1 to 5/);
    expect(validateObservationDraft({ category: 'manager_evaluation', summary: 'x', metricValue: 3.5 })).toMatch(/1 to 5/);
    expect(validateObservationDraft({ category: 'manager_evaluation', summary: 'x', metricValue: 4 })).toBeNull();
  });
  it('requires a positive measurement for timed categories', () => {
    expect(validateObservationDraft({ category: 'table_cleaning', summary: 'x' })).toMatch(/minutes/);
    expect(validateObservationDraft({ category: 'service_response', summary: 'x', metricValue: 0 })).toMatch(/seconds/);
    expect(validateObservationDraft({ category: 'service_response', summary: 'x', metricValue: 45 })).toBeNull();
  });
});

describe('resolveAiAttribution — never guesses', () => {
  const staff = [
    { employeeId: 'EMP-001', role: 'waiter', status: 'active' as const, branchId: 'b1' },
    { employeeId: 'EMP-002', role: 'cashier', status: 'active' as const, branchId: 'b1' },
    { employeeId: 'EMP-003', role: 'waiter', status: 'inactive' as const, branchId: 'b1' },
    { employeeId: 'EMP-009', role: 'waiter', status: 'active' as const, branchId: 'b2' },
  ];
  const base = { branchId: 'b1', category: 'table_cleaning' as const, confidence: 0.95 };

  it('attributes a confident, known, active, relevant employee', () => {
    expect(resolveAiAttribution({ ...base, employeeId: 'EMP-001' }, staff)).toMatchObject({ outcome: 'attributed', employeeId: 'EMP-001' });
  });

  it.each([
    ['no id', { ...base, employeeId: undefined }, /did not identify/],
    ['unknown id', { ...base, employeeId: 'EMP-404' }, /not on this branch/],
    ['other branch', { ...base, employeeId: 'EMP-009' }, /not on this branch/],
    ['inactive', { ...base, employeeId: 'EMP-003' }, /inactive/],
    ['low confidence', { ...base, employeeId: 'EMP-001', confidence: MIN_AI_CONFIDENCE - 0.01 }, /below/],
    ['missing confidence', { ...base, employeeId: 'EMP-001', confidence: undefined }, /below/],
    ['irrelevant to role', { ...base, employeeId: 'EMP-002' }, /not part of the cashier role/],
  ])('leaves it unattributed: %s', (_label, payload, reason) => {
    const d = resolveAiAttribution(payload as any, staff);
    expect(d.outcome).toBe('unattributed');
    expect(d.employeeId).toBeUndefined();
    expect(d.reason).toMatch(reason);
  });
});

describe('summarizeEmployee', () => {
  it('scopes attendance and observations to the employee and flags unlinked logins', () => {
    const s = summarizeEmployee(emp({ employeeId: 'EMP-004', userId: undefined }), {
      attendance: [
        { employeeId: 'EMP-004', logDate: '2026-11-02', checkInTime: new Date(), lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0 },
        { employeeId: 'EMP-001', logDate: '2026-11-02', checkInTime: new Date(), lateMinutes: 9, earlyLeaveMinutes: 0, overtimeMinutes: 0 },
      ],
      orders: [{ orderId: 'o1', addedBy: 'u1', createdAt: new Date() }],
      payments: [],
      observations: [obs({ employeeId: 'EMP-001', category: 'customer_complaint' })],
    });
    expect(s.posLinked).toBe(false);
    expect(s.attendance.daysPresent).toBe(1);
    expect(s.attendance.lateArrivals).toBe(0);
    expect(s.orders.ordersHandled).toBe(0);
    expect(s.observations.complaints).toBe(0);
  });
});
