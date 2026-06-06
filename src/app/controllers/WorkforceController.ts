import { supabase } from '../../lib/supabase';
import {
  Employee, EmployeeWithUser, CreateEmployeeInput, EmployeeFilters,
  UserRole, LeaveRequest, LeaveFilters,
} from '../models/types';

const uid = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// ─── Department default by role ───────────────────────────────────────────────
const defaultDepartment = (role: string): string => {
  const map: Record<string, string> = {
    kitchen: 'Kitchen', juice: 'Kitchen',
    cashier: 'Cashier',
    waiter: 'Service',
    hr: 'HR',
    accounting: 'Finance',
    manager: 'Management', supervisor: 'Management',
  };
  return map[role] ?? 'Operations';
};

// ─── Next employee number ─────────────────────────────────────────────────────
async function nextEmployeeNumber(branchId: string): Promise<string> {
  const { count } = await supabase
    .from('employees')
    .select('*', { count: 'exact', head: true })
    .eq('branch_id', branchId);
  const seq = ((count ?? 0) + 1).toString().padStart(3, '0');
  return `EMP-${seq}`;
}

// ─── Mappers ──────────────────────────────────────────────────────────────────
function mapEmployee(row: any): Employee {
  return {
    id: row.id,
    userId: row.user_id,
    employeeId: row.employee_id,
    employeeNumber: row.employee_number,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    department: row.department,
    hireDate: row.hire_date,
    monthlySalary: Number(row.monthly_salary),
    shiftStart: row.shift_start,
    shiftEnd: row.shift_end,
    earlyCheckinMinutes: row.early_checkin_minutes,
    lateCheckoutMinutes: row.late_checkout_minutes,
    status: row.status,
    avatarUrl: row.avatar_url,
    notes: row.notes,
    branchId: row.branch_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

type Result<T> = { success: true; data: T } | { success: false; error: string };

// ─────────────────────────────────────────────────────────────────────────────
// WorkforceController
// Single source of truth for employee lifecycle.
// Attendance / Payroll / Fingerprint remain in HRController.
// ─────────────────────────────────────────────────────────────────────────────
export class WorkforceController {

  // ── Create employee (atomically creates users + employees rows) ──────────────
  static async createEmployee(
    input: CreateEmployeeInput
  ): Promise<Result<EmployeeWithUser>> {
    if (input.role === 'admin') {
      return { success: false, error: 'Admin cannot be created as an employee.' };
    }

    const userId   = uid('user');
    const empRowId = uid('emp');
    const empNumber = await nextEmployeeNumber(input.branchId);

    // 1. Insert POS login account
    const { data: userRow, error: userErr } = await supabase
      .from('users')
      .insert({
        id: userId,
        name: input.fullName,
        employment_number: empNumber,
        role: input.role,
        pin: input.pin,
        email: input.email,
        status: 'active',
        branch_id: input.branchId,
        hire_date: input.hireDate,
      })
      .select()
      .single();

    if (userErr) return { success: false, error: userErr.message };

    // 2. Insert HR employee record, linked to the user
    const { data: empRow, error: empErr } = await supabase
      .from('employees')
      .insert({
        id: empRowId,
        user_id: userId,
        employee_id: empNumber,
        employee_number: empNumber,
        full_name: input.fullName,
        email: input.email,
        phone: input.phone ?? null,
        role: input.role,
        hire_date: input.hireDate,
        monthly_salary: input.monthlySalary,
        shift_start: input.shiftStart,
        shift_end: input.shiftEnd,
        early_checkin_minutes: 5,
        late_checkout_minutes: 5,
        status: 'active',
        notes: input.notes ?? null,
        branch_id: input.branchId,
      })
      .select()
      .single();

    if (empErr) {
      // Rollback the user row to keep the DB consistent
      await supabase.from('users').delete().eq('id', userId);
      return { success: false, error: empErr.message };
    }

    const employee = mapEmployee(empRow);
    return {
      success: true,
      data: { ...employee, pin: userRow.pin, lastLogin: undefined },
    };
  }

  // ── Get all employees (never includes admin) ──────────────────────────────
  static async getEmployees(
    filters: EmployeeFilters = {}
  ): Promise<Result<EmployeeWithUser[]>> {
    try {
      let query = supabase
        .from('employees')
        .select('*')
        .neq('role', 'admin')
        .order('full_name');

      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters.role) query = query.eq('role', filters.role);
      if (filters.department) query = query.eq('department', filters.department);
      if (filters.search) {
        query = query.or(
          `full_name.ilike.%${filters.search}%,employee_number.ilike.%${filters.search}%,email.ilike.%${filters.search}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;

      // If employees table is present but empty (migrations not applied yet),
      // fall back to reading non-admin users so the UI remains usable.
      let rows = data ?? [];
      if ((rows || []).length === 0) {
        try {
          const { data: usersData } = await supabase
            .from('users')
            .select('*')
            .neq('role', 'admin')
            .order('name');

          if (usersData && usersData.length > 0) {
            rows = usersData.map((u: any) => ({
              id: `emp-synth-${u.id}`,
              user_id: u.id,
              employee_id: u.employment_number ?? u.id,
              employee_number: u.employment_number ?? u.id,
              full_name: u.name,
              email: u.email,
              role: u.role,
              department: null,
              hire_date: u.hire_date ?? u.created_at,
              monthly_salary: (u.hourly_rate ? u.hourly_rate * 160 : 0),
              shift_start: '09:00',
              shift_end: '18:00',
              early_checkin_minutes: 5,
              late_checkout_minutes: 5,
              status: u.status ?? 'active',
              avatar_url: u.avatar_url ?? null,
              notes: null,
              branch_id: u.branch_id ?? 'branch-1',
              created_at: u.created_at,
              updated_at: u.updated_at ?? new Date().toISOString(),
            }));
          }
        } catch (uerr) {
          // ignore and continue with empty rows
        }
      }

      // Attach hasFingerprint flag
      const { data: fps } = await supabase
        .from('employee_fingerprints')
        .select('employee_id')
        .eq('is_active', true);
      const fpSet = new Set((fps ?? []).map((r: any) => r.employee_id));

      // Attach today's attendance status
      const today = new Date().toISOString().split('T')[0];
      const { data: todayLogs } = await supabase
        .from('attendance_logs')
        .select('employee_id, check_in_time, check_out_time, status')
        .eq('log_date', today);
      const logMap = new Map((todayLogs ?? []).map((l: any) => [l.employee_id, l]));

      const employees: EmployeeWithUser[] = (rows ?? []).map((row: any) => {
        const emp = mapEmployee(row);
        const log = logMap.get(emp.employeeId);
        return {
          ...emp,
          hasFingerprint: fpSet.has(emp.employeeId),
          todayStatus: log
            ? (log.check_out_time ? 'present' : 'present')
            : 'not-checked-in',
          todayCheckIn: log?.check_in_time ? new Date(log.check_in_time) : undefined,
          todayCheckOut: log?.check_out_time ? new Date(log.check_out_time) : undefined,
        };
      });

      return { success: true, data: employees };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ── Get single employee with full profile ─────────────────────────────────
  static async getEmployee(employeeId: string): Promise<Result<EmployeeWithUser>> {
    try {
      const { data: rows, error } = await supabase
        .from('employees')
        .select('*')
        .eq('employee_id', employeeId)
        .limit(1);
      if (error) throw error;
      const row = rows?.[0] ?? null;
      if (!row) throw new Error(`Employee ${employeeId} not found`);

      const { data: fp } = await supabase
        .from('employee_fingerprints')
        .select('employee_id')
        .eq('employee_id', employeeId)
        .eq('is_active', true)
        .maybeSingle();

      const today = new Date().toISOString().split('T')[0];
      const { data: todayLog } = await supabase
        .from('attendance_logs')
        .select('check_in_time, check_out_time, status')
        .eq('employee_id', employeeId)
        .eq('log_date', today)
        .maybeSingle();

      const emp = mapEmployee(row);
      return {
        success: true,
        data: {
          ...emp,
          hasFingerprint: !!fp,
          todayStatus: todayLog ? 'present' : 'not-checked-in',
          todayCheckIn: todayLog?.check_in_time ? new Date(todayLog.check_in_time) : undefined,
          todayCheckOut: todayLog?.check_out_time ? new Date(todayLog.check_out_time) : undefined,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ── Update employee (syncs both employees + users rows) ───────────────────
  static async updateEmployee(
    employeeId: string,
    updates: Partial<CreateEmployeeInput>
  ): Promise<Result<Employee>> {
    try {
      const empUpdates: Record<string, any> = {};
      const userUpdates: Record<string, any> = {};

      if (updates.fullName)       { empUpdates.full_name    = updates.fullName;     userUpdates.name = updates.fullName; }
      if (updates.email)          { empUpdates.email        = updates.email;        userUpdates.email = updates.email; }
      if (updates.phone !== undefined) empUpdates.phone    = updates.phone;
      if (updates.role)           { empUpdates.role         = updates.role;         userUpdates.role = updates.role; }
      if (updates.department)       empUpdates.department   = updates.department;
      if (updates.hireDate)         empUpdates.hire_date    = updates.hireDate;
      if (updates.monthlySalary !== undefined) empUpdates.monthly_salary = updates.monthlySalary;
      if (updates.shiftStart)       empUpdates.shift_start  = updates.shiftStart;
      if (updates.shiftEnd)         empUpdates.shift_end    = updates.shiftEnd;
      if (updates.notes !== undefined) empUpdates.notes     = updates.notes;
      if (updates.pin)              userUpdates.pin         = updates.pin;

      const { error: empErr } = await supabase
        .from('employees')
        .update(empUpdates)
        .eq('employee_id', employeeId);
      if (empErr) throw empErr;

      const { data: empRow } = await supabase
        .from('employees')
        .select('*')
        .eq('employee_id', employeeId)
        .limit(1)
        .maybeSingle();

      // Sync user row if any user-facing fields changed
      if (Object.keys(userUpdates).length > 0 && empRow.user_id) {
        await supabase
          .from('users')
          .update(userUpdates)
          .eq('id', empRow.user_id);
      }

      return { success: true, data: mapEmployee(empRow) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ── Deactivate employee (disables login + marks inactive) ────────────────
  static async deactivateEmployee(employeeId: string): Promise<Result<void>> {
    try {
      const { data: empRow } = await supabase
        .from('employees')
        .select('user_id')
        .eq('employee_id', employeeId)
        .limit(1)
        .maybeSingle();

      const { data: updatedRows, error: empErr } = await supabase
        .from('employees')
        .update({ status: 'inactive' })
        .eq('employee_id', employeeId)
        .select('id');
      if (empErr) throw empErr;
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error('Employee not found or update was blocked by database policy.');
      }

      if (empRow?.user_id) {
        await supabase
          .from('users')
          .update({ status: 'inactive' })
          .eq('id', empRow.user_id);
      }

      return { success: true, data: undefined };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ── Reactivate employee ───────────────────────────────────────────────────
  static async reactivateEmployee(employeeId: string): Promise<Result<void>> {
    try {
      const { data: empRow } = await supabase
        .from('employees')
        .select('user_id')
        .eq('employee_id', employeeId)
        .limit(1)
        .maybeSingle();

      const { data: updatedRows, error: empErr } = await supabase
        .from('employees')
        .update({ status: 'active' })
        .eq('employee_id', employeeId)
        .select('id');
      if (empErr) throw empErr;
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error('Employee not found or update was blocked by database policy.');
      }

      if (empRow?.user_id) {
        await supabase
          .from('users')
          .update({ status: 'active' })
          .eq('id', empRow.user_id);
      }

      return { success: true, data: undefined };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ── Delete employee permanently ───────────────────────────────────────────
  static async deleteEmployee(employeeId: string): Promise<Result<void>> {
    try {
      const { data: empRow } = await supabase
        .from('employees')
        .select('user_id')
        .eq('employee_id', employeeId)
        .limit(1)
        .maybeSingle();

      await supabase.from('employees').delete().eq('employee_id', employeeId);

      if (empRow?.user_id) {
        await supabase.from('users').delete().eq('id', empRow.user_id);
      }

      return { success: true, data: undefined };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ── Today's workforce snapshot (for dashboard) ───────────────────────────
  static async getTodaySnapshot(branchId: string): Promise<Result<{
    total: number; present: number; absent: number;
    late: number; onLeave: number; clockedOut: number;
  }>> {
    try {
      const today = new Date().toISOString().split('T')[0];

      const [empResult, logsResult] = await Promise.all([
        supabase.from('employees').select('*', { count: 'exact', head: true })
          .eq('branch_id', branchId).eq('status', 'active').neq('role', 'admin'),
        supabase.from('attendance_logs').select('employee_id, status, check_out_time')
          .eq('log_date', today).eq('branch_id', branchId),
      ]);

      const total      = empResult.count ?? 0;
      const logs       = logsResult.data ?? [];
      const present    = logs.filter(l => !l.check_out_time).length;
      const clockedOut = logs.filter(l => l.check_out_time).length;
      const late       = logs.filter(l => l.status === 'late').length;
      const absent     = Math.max(0, total - logs.length);

      return { success: true, data: { total, present, absent, late, clockedOut, onLeave: 0 } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ── Get distinct departments ──────────────────────────────────────────────
  static async getDepartments(branchId: string): Promise<string[]> {
    const { data } = await supabase
      .from('employees')
      .select('department')
      .eq('branch_id', branchId)
      .neq('role', 'admin');
    const set = new Set((data ?? []).map((r: any) => r.department).filter(Boolean));
    return Array.from(set).sort();
  }

  // ── Submit a leave request ────────────────────────────────────────────────
  static async submitLeaveRequest(input: {
    employeeId: string;
    leaveType: LeaveRequest['leaveType'];
    startDate: string;
    endDate: string;
    daysCount: number;
    reason?: string;
    branchId: string;
  }): Promise<Result<LeaveRequest>> {
    const { data, error } = await supabase
      .from('leave_requests')
      .insert({
        id: uid('leave'),
        employee_id: input.employeeId,
        leave_type: input.leaveType,
        start_date: input.startDate,
        end_date: input.endDate,
        days_count: input.daysCount,
        reason: input.reason ?? null,
        status: 'pending',
        branch_id: input.branchId,
      })
      .select()
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: mapLeaveRequest(data) };
  }

  // ── Approve or reject a leave request ────────────────────────────────────
  static async reviewLeaveRequest(
    id: string,
    status: 'approved' | 'rejected',
    reviewedBy: string
  ): Promise<Result<void>> {
    const { error } = await supabase
      .from('leave_requests')
      .update({ status, reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true, data: undefined };
  }

  // ── Get leave requests with optional filters ──────────────────────────────
  static async getLeaveRequests(
    branchId: string,
    filters: LeaveFilters = {}
  ): Promise<Result<LeaveRequest[]>> {
    try {
      let query = supabase
        .from('leave_requests')
        .select('*, employees(full_name)')
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false });

      if (filters.employeeId) query = query.eq('employee_id', filters.employeeId);
      if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
      if (filters.month) {
        const year  = filters.year ?? new Date().getFullYear();
        const month = filters.month.toString().padStart(2, '0');
        query = query
          .gte('start_date', `${year}-${month}-01`)
          .lt('start_date',  `${year}-${(filters.month % 12) + 1 < 10 ? '0' : ''}${(filters.month % 12) + 1}-01`);
      }

      const { data, error } = await query;
      if (error) throw error;

      return {
        success: true,
        data: (data ?? []).map((r: any) => ({
          ...mapLeaveRequest(r),
          employeeName: r.employees?.full_name ?? undefined,
        })),
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}

function mapLeaveRequest(row: any): LeaveRequest {
  return {
    id: row.id,
    employeeId: row.employee_id,
    leaveType: row.leave_type,
    startDate: row.start_date,
    endDate: row.end_date,
    daysCount: row.days_count,
    reason: row.reason ?? undefined,
    status: row.status,
    reviewedBy: row.reviewed_by ?? undefined,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : undefined,
    branchId: row.branch_id,
    createdAt: new Date(row.created_at),
  };
}
