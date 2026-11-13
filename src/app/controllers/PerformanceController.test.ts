import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFakeDb, FakeDb } from '../../test/fakeSupabase';

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: (t: string) => h.db.client.from(t) } }));

import { PerformanceController } from './PerformanceController';
import { mapEmployee } from '../models/mappers';

// ─── Seed: an existing HR dataset (the source of truth) ───────────────────────
const iso = (d: number, hh = 12) => new Date(2026, 10, d, hh).toISOString();
const empRow = (p: Record<string, any>) => ({
  monthly_salary: 3000, shift_start: '09:00', shift_end: '17:00',
  early_checkin_minutes: 5, late_checkout_minutes: 5, status: 'active', branch_id: 'b1',
  created_at: iso(1), updated_at: iso(1), ...p,
});

function seed() {
  return {
    employees: [
      empRow({ id: 'e1', employee_id: 'EMP-001', employee_number: 'EMP-001', full_name: 'Alice', role: 'waiter', user_id: 'u-alice' }),
      empRow({ id: 'e2', employee_id: 'EMP-002', employee_number: 'EMP-002', full_name: 'Bob', role: 'cashier', user_id: 'u-bob' }),
      empRow({ id: 'e3', employee_id: 'EMP-003', employee_number: 'EMP-003', full_name: 'Carol', role: 'kitchen', user_id: 'u-carol' }),
      empRow({ id: 'e4', employee_id: 'EMP-004', employee_number: 'EMP-004', full_name: 'Dan', role: 'waiter', user_id: null }),
      empRow({ id: 'e5', employee_id: 'EMP-005', employee_number: 'EMP-005', full_name: 'Ed', role: 'waiter', user_id: 'u-ed', status: 'inactive' }),
      empRow({ id: 'e9', employee_id: 'EMP-009', employee_number: 'EMP-009', full_name: 'Eve', role: 'waiter', user_id: 'u-eve', branch_id: 'b2' }),
    ],
    attendance_logs: [
      { id: 'a1', employee_id: 'EMP-001', full_name: 'Alice', log_date: '2026-11-02', check_in_time: iso(2, 9), late_minutes: 0, early_leave_minutes: 0, overtime_minutes: 0, status: 'on-time', branch_id: 'b1' },
      { id: 'a2', employee_id: 'EMP-001', full_name: 'Alice', log_date: '2026-11-03', check_in_time: iso(3, 9), late_minutes: 12, early_leave_minutes: 0, overtime_minutes: 0, status: 'late', branch_id: 'b1' },
      { id: 'a3', employee_id: 'EMP-001', full_name: 'Alice', log_date: '2026-11-04', check_in_time: iso(4, 9), late_minutes: 0, early_leave_minutes: 0, overtime_minutes: 20, status: 'completed', branch_id: 'b1' },
      { id: 'a4', employee_id: 'EMP-009', full_name: 'Eve', log_date: '2026-11-04', check_in_time: iso(4, 9), late_minutes: 0, early_leave_minutes: 0, overtime_minutes: 0, status: 'on-time', branch_id: 'b2' },
    ],
    orders: [
      { id: 'o1', table_id: 't1', branch_id: 'b1' },
      { id: 'o2', table_id: null, branch_id: 'b1' },
      { id: 'o3', table_id: 't2', branch_id: 'b1' },
    ],
    order_items: [
      { id: 'i1', order_id: 'o1', added_by: 'u-alice', status: 'served', branch_id: 'b1', created_at: iso(3) },
      { id: 'i2', order_id: 'o1', added_by: 'u-alice', status: 'served', branch_id: 'b1', created_at: iso(3) },
      { id: 'i3', order_id: 'o2', added_by: 'u-alice', status: 'ready', branch_id: 'b1', created_at: iso(4) },
      { id: 'i4', order_id: 'o3', added_by: 'u-alice', status: 'cancelled', branch_id: 'b1', created_at: iso(4) },
      { id: 'i5', order_id: 'o3', added_by: 'u-admin', status: 'served', branch_id: 'b1', created_at: iso(4) }, // admin, not an employee
      { id: 'i6', order_id: 'o1', added_by: 'u-alice', status: 'served', branch_id: 'b1', created_at: new Date(2026, 9, 1).toISOString() }, // out of range
    ],
    order_payments: [
      { id: 'p1', cashier_id: 'u-bob', branch_id: 'b1', created_at: iso(3) },
      { id: 'p2', cashier_id: 'u-bob', branch_id: 'b1', created_at: iso(4) },
      { id: 'p3', cashier_id: 'u-bob', branch_id: 'b1', created_at: new Date(2026, 9, 1).toISOString() },
    ],
    employee_performance_observations: [
      { id: 'ob1', employee_id: 'EMP-001', branch_id: 'b1', source: 'customer', category: 'customer_compliment', observed_at: iso(5), summary: 'Great service', review_status: 'verified', reviewed_by: 'u-mgr' },
      { id: 'ob2', employee_id: 'EMP-001', branch_id: 'b1', source: 'ai_cctv', category: 'service_response', observed_at: iso(5), metric_value: 300, metric_unit: 'seconds', summary: 'Slow', evidence: { camera_id: 'c1' }, confidence: 0.9, review_status: 'pending' },
      { id: 'ob3', employee_id: 'EMP-001', branch_id: 'b1', source: 'customer', category: 'customer_complaint', observed_at: iso(6), summary: 'Rude?', review_status: 'dismissed', reviewed_by: 'u-mgr' },
      { id: 'ob4', employee_id: 'EMP-001', branch_id: 'b1', source: 'ai_cctv', category: 'table_cleaning', observed_at: iso(6), metric_value: 4, metric_unit: 'minutes', summary: 'Reset t1', evidence: { camera_id: 'c2' }, confidence: 0.85, review_status: 'corrected', reviewed_by: 'u-mgr', original_employee_id: 'EMP-004' },
      { id: 'ob5', employee_id: null, branch_id: 'b1', source: 'ai_cctv', category: 'table_cleaning', observed_at: iso(7), metric_value: 9, metric_unit: 'minutes', summary: 'Reset t2', evidence: { camera_id: 'c2' }, confidence: 0.5, review_status: 'pending' },
    ],
  };
}

const last = <T,>(xs: T[]): T => xs[xs.length - 1];
const NOV = { from: new Date(2026, 10, 1), to: new Date(2026, 10, 30) };
const manager = { id: 'u-mgr', role: 'manager' };
let db: FakeDb;

beforeEach(() => {
  db = createFakeDb(seed());
  h.db = db;
});

describe('getTeamPerformance — reads existing HR + POS data', () => {
  it('lists only this branch\'s active employees, with no duplicates', async () => {
    const r = await PerformanceController.getTeamPerformance('b1', NOV);
    expect(r.success).toBe(true);
    const ids = (r as any).data.map((s: any) => s.employee.employeeId);
    expect(ids.sort()).toEqual(['EMP-001', 'EMP-002', 'EMP-003', 'EMP-004']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('attributes POS activity only via the linked login and existing attendance', async () => {
    const r: any = await PerformanceController.getTeamPerformance('b1', NOV);
    const by = (id: string) => r.data.find((s: any) => s.employee.employeeId === id);
    const alice = by('EMP-001');
    expect(alice.orders).toEqual({ ordersHandled: 2, itemsEntered: 3, tablesServed: 1 }); // voided + out-of-range excluded
    expect(alice.attendance).toMatchObject({ daysPresent: 3, lateArrivals: 1, overtimeMinutes: 20 });
    expect(alice.observations).toMatchObject({ compliments: 1, complaints: 0, pending: 1, avgTableCleaningMin: 4, avgServiceResponseSec: null });
    expect(by('EMP-002').paymentsProcessed).toBe(2);
    expect(by('EMP-004')).toMatchObject({ posLinked: false, orders: { ordersHandled: 0, itemsEntered: 0, tablesServed: 0 } });
    // The admin's item (u-admin) is credited to nobody.
    const totalItems = r.data.reduce((s: number, x: any) => s + x.orders.itemsEntered, 0);
    expect(totalItems).toBe(3);
  });

  it('only shows role-relevant metrics', async () => {
    const r: any = await PerformanceController.getTeamPerformance('b1', NOV);
    const carol = r.data.find((s: any) => s.employee.employeeId === 'EMP-003');
    expect(carol.metrics).not.toContain('ordersHandled');
    expect(carol.metrics).not.toContain('tableCleaning');
  });

  it('is read-only', async () => {
    await PerformanceController.getTeamPerformance('b1', NOV);
    expect(db.writes()).toEqual([]);
  });

  it('rejects unbounded ranges', async () => {
    const r = await PerformanceController.getTeamPerformance('b1', { from: new Date(2026, 0, 1), to: new Date(2026, 10, 1) });
    expect(r).toMatchObject({ success: false, error: expect.stringMatching(/93 days/) });
  });

  it('pages past PostgREST\'s 1000-row cap instead of truncating', async () => {
    for (let i = 0; i < 2500; i++) {
      db.tables.orders.push({ id: `bulk-${i}`, table_id: 't9', branch_id: 'b1' });
      db.tables.order_items.push({ id: `bi-${i}`, order_id: `bulk-${i}`, added_by: 'u-alice', status: 'served', branch_id: 'b1', created_at: iso(8) });
    }
    const r: any = await PerformanceController.getTeamPerformance('b1', NOV);
    expect(r.data.find((s: any) => s.employee.employeeId === 'EMP-001').orders.ordersHandled).toBe(2502);
  });
});

describe('getEmployeePerformance', () => {
  it('returns summary, weekly trend and newest-first observations', async () => {
    const alice = mapEmployee(db.tables.employees[0]);
    const r: any = await PerformanceController.getEmployeePerformance(alice, NOV);
    expect(r.success).toBe(true);
    expect(r.data.summary.orders.ordersHandled).toBe(2);
    expect(r.data.trend.length).toBeGreaterThan(3);
    const times = r.data.observations.map((o: any) => o.observedAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('never queries POS activity for an employee with no linked login', async () => {
    const dan = mapEmployee(db.tables.employees[3]);
    await PerformanceController.getEmployeePerformance(dan, NOV);
    const read = db.log.map(l => l.table);
    expect(read).not.toContain('order_items');
    expect(read).not.toContain('order_payments');
  });
});

describe('ingestAiObservation — AI never auto-counts and never guesses', () => {
  const payload = {
    branchId: 'b1', category: 'table_cleaning' as const, observedAt: new Date(2026, 10, 9, 14),
    summary: 'Table 4 reset after guests left', metricValue: 6, confidence: 0.93,
    evidence: { camera_id: 'cam-3', clip_ref: 'clip-123', table_id: 't4' }, source: 'cctv-test',
  };
  const lastInsert = () => last(db.tables.employee_performance_observations);

  it('stores a confident, relevant identification as PENDING review', async () => {
    const r: any = await PerformanceController.ingestAiObservation({ ...payload, employeeId: 'EMP-001' });
    expect(r.success).toBe(true);
    expect(r.data.decision.outcome).toBe('attributed');
    expect(lastInsert()).toMatchObject({
      employee_id: 'EMP-001', source: 'ai_cctv', review_status: 'pending', metric_unit: 'minutes', created_by: 'cctv-test',
    });
    expect(lastInsert().evidence).toMatchObject({ camera_id: 'cam-3', attribution: { requested_employee_id: 'EMP-001', outcome: 'attributed' } });
  });

  it.each([
    ['unknown employee', 'EMP-404', 0.99],
    ['employee in another branch', 'EMP-009', 0.99],
    ['inactive employee', 'EMP-005', 0.99],
    ['low confidence', 'EMP-001', 0.5],
    ['role mismatch (cashier cleaning tables)', 'EMP-002', 0.99],
  ])('keeps %s unattributed for a manager', async (_l, employeeId, confidence) => {
    const r: any = await PerformanceController.ingestAiObservation({ ...payload, employeeId, confidence });
    expect(r.success).toBe(true);
    expect(lastInsert().employee_id).toBeNull();
    expect(lastInsert().review_status).toBe('pending');
    expect(lastInsert().evidence.attribution.requested_employee_id).toBe(employeeId);
  });

  it('rejects observations without evidence and AI "evaluations"', async () => {
    const before = db.tables.employee_performance_observations.length;
    expect(await PerformanceController.ingestAiObservation({ ...payload, evidence: {} })).toMatchObject({ success: false });
    expect(await PerformanceController.ingestAiObservation({ ...payload, category: 'manager_evaluation' as any })).toMatchObject({ success: false });
    expect(db.tables.employee_performance_observations.length).toBe(before);
  });

  it('only ever writes to the observations table (no employee duplicates)', async () => {
    const employeesBefore = JSON.stringify(db.tables.employees);
    await PerformanceController.ingestAiObservation({ ...payload, employeeId: 'EMP-001' });
    await PerformanceController.ingestAiObservation({ ...payload, employeeId: 'EMP-777' });
    expect(new Set(db.writes().map(w => w.table))).toEqual(new Set(['employee_performance_observations']));
    expect(JSON.stringify(db.tables.employees)).toBe(employeesBefore);
  });
});

describe('reviewObservation — managers verify, correct, dismiss', () => {
  const row = (id: string) => db.tables.employee_performance_observations.find(o => o.id === id);

  it('verifies an attributed observation and records the reviewer', async () => {
    const r = await PerformanceController.reviewObservation('ob2', { action: 'verify', reviewer: manager, note: 'Checked clip' });
    expect(r.success).toBe(true);
    expect(row('ob2')).toMatchObject({ review_status: 'verified', reviewed_by: 'u-mgr', review_note: 'Checked clip' });
    expect(row('ob2').reviewed_at).toBeTruthy();
  });

  it('refuses to "verify" an unattributed observation', async () => {
    const r = await PerformanceController.reviewObservation('ob5', { action: 'verify', reviewer: manager });
    expect(r).toMatchObject({ success: false, error: expect.stringMatching(/unattributed/) });
    expect(row('ob5').review_status).toBe('pending');
  });

  it('corrects (assigns) the employee', async () => {
    const r = await PerformanceController.reviewObservation('ob5', { action: 'correct', reviewer: manager, correctedEmployeeId: 'EMP-004' });
    expect(r.success).toBe(true);
    expect(row('ob5')).toMatchObject({ employee_id: 'EMP-004', review_status: 'corrected' });
  });

  it('requires an employee for a correction', async () => {
    expect(await PerformanceController.reviewObservation('ob5', { action: 'correct', reviewer: manager })).toMatchObject({ success: false });
  });

  it('dismisses', async () => {
    await PerformanceController.reviewObservation('ob2', { action: 'dismiss', reviewer: { id: 'u-hr', role: 'hr' } });
    expect(row('ob2')).toMatchObject({ review_status: 'dismissed', reviewed_by: 'u-hr' });
  });

  it('respects existing HR permissions (canManageStaff)', async () => {
    for (const role of ['waiter', 'cashier', 'supervisor', 'accounting']) {
      const r = await PerformanceController.reviewObservation('ob2', { action: 'verify', reviewer: { id: 'u-x', role } });
      expect(r).toMatchObject({ success: false, error: expect.stringMatching(/permission/) });
    }
    expect(row('ob2').review_status).toBe('pending');
    expect(db.writes()).toEqual([]);
  });

  it('surfaces database rejections (e.g. the 0026 trigger) instead of swallowing them', async () => {
    db.failOn('employee_performance_observations', 'update', 'employee EMP-009 does not exist in branch b1');
    const r = await PerformanceController.reviewObservation('ob5', { action: 'correct', reviewer: manager, correctedEmployeeId: 'EMP-009' });
    expect(r).toMatchObject({ success: false, error: expect.stringMatching(/does not exist in branch/) });
  });
});

describe('recordObservation — manager entries', () => {
  const alice = { employeeId: 'EMP-001', branchId: 'b1' };

  it('records a manager evaluation as verified, authored by the reviewer', async () => {
    const r: any = await PerformanceController.recordObservation({
      employee: alice, source: 'manager', category: 'manager_evaluation', summary: 'Solid month', metricValue: 4, reviewer: manager,
    });
    expect(r.success).toBe(true);
    expect(last(db.tables.employee_performance_observations)).toMatchObject({
      employee_id: 'EMP-001', review_status: 'verified', reviewed_by: 'u-mgr', created_by: 'u-mgr', metric_unit: 'rating', metric_value: 4,
    });
  });

  it('validates input and permissions before writing', async () => {
    const bad = await PerformanceController.recordObservation({
      employee: alice, source: 'manager', category: 'manager_evaluation', summary: 'x', metricValue: 9, reviewer: manager,
    });
    const denied = await PerformanceController.recordObservation({
      employee: alice, source: 'customer', category: 'customer_complaint', summary: 'x', reviewer: { id: 'u-w', role: 'waiter' },
    });
    expect(bad.success).toBe(false);
    expect(denied.success).toBe(false);
    expect(db.writes()).toEqual([]);
  });
});
