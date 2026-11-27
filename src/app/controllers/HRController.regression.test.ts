/**
 * Regression tests for the EXISTING HR system, added alongside the performance
 * integration (0026). They pin current attendance / payroll / employee-list
 * behaviour and prove the new observations table never influences any of it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createFakeDb, FakeDb } from '../../test/fakeSupabase';

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: (t: string) => h.db.client.from(t) } }));

import { HRController } from './HRController';
import { WorkforceController } from './WorkforceController';
import { PerformanceController } from './PerformanceController';
import { mapEmployee } from '../models/mappers';

const alice = {
  id: 'e1', employee_id: 'EMP-001', employee_number: 'EMP-001', full_name: 'Alice', role: 'waiter',
  user_id: 'u-alice', monthly_salary: 3000, shift_start: '09:00', shift_end: '17:00',
  early_checkin_minutes: 5, late_checkout_minutes: 5, status: 'active', branch_id: 'b1',
};

let db: FakeDb;
beforeEach(() => {
  db = createFakeDb({
    employees: [alice],
    employee_fingerprints: [],
    users: [],
    attendance_logs: [
      { id: 'a1', employee_id: 'EMP-001', full_name: 'Alice', log_date: '2026-11-02', check_in_time: '2026-11-02T09:30:00Z', late_minutes: 30, early_leave_minutes: 0, overtime_minutes: 0, status: 'late', branch_id: 'b1' },
      { id: 'a2', employee_id: 'EMP-001', full_name: 'Alice', log_date: '2026-11-03', check_in_time: '2026-11-03T09:00:00Z', late_minutes: 0, early_leave_minutes: 0, overtime_minutes: 60, status: 'completed', branch_id: 'b1' },
    ],
    payroll_summary: [],
    employee_performance_observations: [
      // Verified complaints + a terrible evaluation must NOT touch salary.
      { id: 'ob1', employee_id: 'EMP-001', branch_id: 'b1', source: 'customer', category: 'customer_complaint', observed_at: '2026-11-05T12:00:00Z', summary: 'x', review_status: 'verified', reviewed_by: 'u-mgr' },
      { id: 'ob2', employee_id: 'EMP-001', branch_id: 'b1', source: 'manager', category: 'manager_evaluation', observed_at: '2026-11-06T12:00:00Z', metric_value: 1, summary: 'x', review_status: 'verified', reviewed_by: 'u-mgr' },
    ],
  });
  h.db = db;
});
afterEach(() => { vi.useRealTimers(); });

describe('payroll is unchanged and independent of performance data', () => {
  it('computes the same figures as before the integration', async () => {
    const r: any = await HRController.computePayroll('EMP-001', 11, 2026, 'u-hr');
    expect(r.success).toBe(true);
    // dailyRate = 3000/30 = 100; minuteRate = 100/480
    expect(r.data).toMatchObject({
      presentDays: 2, absentDays: 0, totalLateMinutes: 30, totalOvertimeMinutes: 60,
      lateDeduction: 6.25, overtimeBonus: 18.75, netSalary: 3012.5, status: 'draft',
    });
  });

  it('deducts salary advances dated 8th of the month to 7th of the next, by login user id', async () => {
    db.tables.expenses = [
      { id: 'x1', category: 'salary', employee_id: 'u-alice', amount: 200, date: '2026-11-08' },
      { id: 'x2', category: 'salary', employee_id: 'u-alice', amount: 100.5, date: '2026-12-07' },
      { id: 'x3', category: 'salary', employee_id: 'u-alice', amount: 999, date: '2026-11-07' },   // previous period
      { id: 'x4', category: 'salary', employee_id: 'u-alice', amount: 999, date: '2026-12-08' },   // next period
      { id: 'x5', category: 'supplies', employee_id: 'u-alice', amount: 999, date: '2026-11-20' },
      { id: 'x6', category: 'salary', employee_id: 'EMP-001', amount: 999, date: '2026-11-20' },   // not the login id
    ];
    const r: any = await HRController.computePayroll('EMP-001', 11, 2026, 'u-hr');
    expect(r.data).toMatchObject({ salaryAdvances: 300.5, netSalary: 2712 });
    expect(db.tables.payroll_summary[0]).toMatchObject({ salary_advances: 300.5, net_salary: 2712 });
  });

  it('lets advances push net pay below zero (the employee owes)', async () => {
    db.tables.expenses = [{ id: 'x1', category: 'salary', employee_id: 'u-alice', amount: 3500, date: '2026-11-20' }];
    const r: any = await HRController.computePayroll('EMP-001', 11, 2026, 'u-hr');
    expect(r.data.netSalary).toBe(-487.5);
  });

  it('never reads the observations table', async () => {
    await HRController.computePayroll('EMP-001', 11, 2026, 'u-hr');
    expect(db.log.map(l => l.table)).not.toContain('employee_performance_observations');
  });

  it('gives identical payroll with or without observations present', async () => {
    const withObs: any = await HRController.computePayroll('EMP-001', 11, 2026, 'u-hr');
    db.tables.employee_performance_observations.length = 0;
    const withoutObs: any = await HRController.computePayroll('EMP-001', 11, 2026, 'u-hr');
    const strip = (p: any) => ({ ...p, id: undefined, createdAt: undefined });
    expect(strip(withObs.data)).toEqual(strip(withoutObs.data));
  });
});

describe('attendance calculation is unchanged', () => {
  it('records a late check-in with the existing rules', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 10, 9, 20)); // 09:20 local, shift 09:00
    db.tables.attendance_logs.length = 0;
    const r: any = await HRController.recordScan(mapEmployee(alice), 'pin');
    expect(r).toMatchObject({ success: true, action: 'check-in', statusLabel: 'Late by 20 min' });
    expect(db.tables.attendance_logs[0]).toMatchObject({ late_minutes: 20, status: 'late', check_in_method: 'pin', log_date: '2026-11-10' });
  });

  it('still blocks scans more than 30 minutes before shift start', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 10, 8, 15));
    db.tables.attendance_logs.length = 0;
    const r: any = await HRController.recordScan(mapEmployee(alice), 'pin');
    expect(r).toMatchObject({ success: false, error: expect.stringMatching(/Too early/) });
  });
});

describe('existing employee records stay intact', () => {
  it('performance reads + AI ingestion + review leave employees untouched and unduplicated', async () => {
    const before = JSON.stringify(db.tables.employees);
    await PerformanceController.getTeamPerformance('b1', { from: new Date(2026, 10, 1), to: new Date(2026, 10, 30) });
    const ing: any = await PerformanceController.ingestAiObservation({
      branchId: 'b1', category: 'table_attendance', observedAt: new Date(2026, 10, 9),
      summary: 'Check-back at table 2', employeeId: 'EMP-001', confidence: 0.95, evidence: { camera_id: 'c1' },
    });
    await PerformanceController.reviewObservation(ing.data.observation.id, { action: 'verify', reviewer: { id: 'u-mgr', role: 'manager' } });
    expect(JSON.stringify(db.tables.employees)).toBe(before);

    const list: any = await WorkforceController.getEmployees({ status: 'active' });
    expect(list.data.map((e: any) => e.employeeId)).toEqual(['EMP-001']);
  });
});
