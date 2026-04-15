import { supabase } from '../../lib/supabase';
import { Employee, EmployeeFingerprint, AttendanceLog, PayrollSummary } from '../models/types';

// ─────────────────────────────────────────────
// Utility: generate IDs
// ─────────────────────────────────────────────
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// ─────────────────────────────────────────────
// Utility: simple AES-like XOR encryption for
// fingerprint template storage. In production,
// use Web Crypto API with a server-side key.
// ─────────────────────────────────────────────
const ENCRYPTION_KEY = 'ALNAWRAS_FP_KEY_2024';

function encryptTemplate(data: string): string {
  const key = ENCRYPTION_KEY;
  let result = '';
  for (let i = 0; i < data.length; i++) {
    result += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(result);
}

function decryptTemplate(encoded: string): string {
  const key = ENCRYPTION_KEY;
  const data = atob(encoded);
  let result = '';
  for (let i = 0; i < data.length; i++) {
    result += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─────────────────────────────────────────────
// Time utilities
// ─────────────────────────────────────────────
function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function nowTimeString(): string {
  const n = new Date();
  return `${n.getHours().toString().padStart(2, '0')}:${n.getMinutes().toString().padStart(2, '0')}`;
}

// ─────────────────────────────────────────────
// DB Row → App Type Mappers
// ─────────────────────────────────────────────
function mapEmployee(row: any): Employee {
  return {
    id: row.id,
    userId: row.user_id,
    employeeId: row.employee_id,
    fullName: row.full_name,
    role: row.role,
    monthlySalary: Number(row.monthly_salary),
    shiftStart: row.shift_start,
    shiftEnd: row.shift_end,
    earlyCheckinMinutes: row.early_checkin_minutes,
    lateCheckoutMinutes: row.late_checkout_minutes,
    status: row.status,
    branchId: row.branch_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function mapFingerprint(row: any): EmployeeFingerprint {
  return {
    id: row.id,
    employeeId: row.employee_id,
    templateData: row.template_data,
    templateHash: row.template_hash,
    fingerIndex: row.finger_index,
    qualityScore: row.quality_score,
    isActive: row.is_active,
    enrolledBy: row.enrolled_by,
    enrolledAt: new Date(row.enrolled_at),
  };
}

function mapAttendanceLog(row: any): AttendanceLog {
  return {
    id: row.id,
    employeeId: row.employee_id,
    fullName: row.full_name,
    logDate: row.log_date,
    checkInTime: row.check_in_time ? new Date(row.check_in_time) : undefined,
    checkOutTime: row.check_out_time ? new Date(row.check_out_time) : undefined,
    scheduledStart: row.scheduled_start,
    scheduledEnd: row.scheduled_end,
    lateMinutes: row.late_minutes || 0,
    earlyLeaveMinutes: row.early_leave_minutes || 0,
    overtimeMinutes: row.overtime_minutes || 0,
    status: row.status,
    checkInMethod: row.check_in_method,
    checkOutMethod: row.check_out_method,
    notes: row.notes,
    branchId: row.branch_id,
  };
}

function mapPayroll(row: any): PayrollSummary {
  return {
    id: row.id,
    employeeId: row.employee_id,
    fullName: row.full_name,
    month: row.month,
    year: row.year,
    monthlySalary: Number(row.monthly_salary),
    workingDays: row.working_days,
    presentDays: row.present_days,
    absentDays: row.absent_days,
    totalLateMinutes: row.total_late_minutes,
    totalOvertimeMinutes: row.total_overtime_minutes,
    lateDeduction: Number(row.late_deduction),
    overtimeBonus: Number(row.overtime_bonus),
    netSalary: Number(row.net_salary),
    status: row.status,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at ? new Date(row.approved_at) : undefined,
    branchId: row.branch_id,
    createdAt: new Date(row.created_at),
  };
}

// ─────────────────────────────────────────────
// EMPLOYEE CRUD
// ─────────────────────────────────────────────
export class HRController {

  static async getEmployees(): Promise<{ success: boolean; data?: Employee[]; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('full_name');
      if (error) throw error;

      // Attach hasFingerprint flag
      const { data: fps } = await supabase
        .from('employee_fingerprints')
        .select('employee_id')
        .eq('is_active', true);

      const fpSet = new Set((fps || []).map((r: any) => r.employee_id));
      const employees = (data || []).map((row: any) => ({
        ...mapEmployee(row),
        hasFingerprint: fpSet.has(row.employee_id),
      }));
      return { success: true, data: employees };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  static async addEmployee(
    emp: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<{ success: boolean; data?: Employee; error?: string }> {
    try {
      const id = uid('emp');
      const { data, error } = await supabase
        .from('employees')
        .insert({
          id,
          user_id: emp.userId || null,
          employee_id: emp.employeeId,
          full_name: emp.fullName,
          role: emp.role,
          monthly_salary: emp.monthlySalary,
          shift_start: emp.shiftStart,
          shift_end: emp.shiftEnd,
          early_checkin_minutes: emp.earlyCheckinMinutes,
          late_checkout_minutes: emp.lateCheckoutMinutes,
          status: emp.status,
          branch_id: emp.branchId,
        })
        .select()
        .single();
      if (error) throw error;
      return { success: true, data: mapEmployee(data) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  static async updateEmployee(
    employeeId: string,
    updates: Partial<Employee>
  ): Promise<{ success: boolean; data?: Employee; error?: string }> {
    try {
      const dbUpdates: any = {};
      if (updates.fullName !== undefined) dbUpdates.full_name = updates.fullName;
      if (updates.role !== undefined) dbUpdates.role = updates.role;
      if (updates.monthlySalary !== undefined) dbUpdates.monthly_salary = updates.monthlySalary;
      if (updates.shiftStart !== undefined) dbUpdates.shift_start = updates.shiftStart;
      if (updates.shiftEnd !== undefined) dbUpdates.shift_end = updates.shiftEnd;
      if (updates.earlyCheckinMinutes !== undefined) dbUpdates.early_checkin_minutes = updates.earlyCheckinMinutes;
      if (updates.lateCheckoutMinutes !== undefined) dbUpdates.late_checkout_minutes = updates.lateCheckoutMinutes;
      if (updates.status !== undefined) dbUpdates.status = updates.status;

      const { data, error } = await supabase
        .from('employees')
        .update(dbUpdates)
        .eq('employee_id', employeeId)
        .select()
        .single();
      if (error) throw error;
      return { success: true, data: mapEmployee(data) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  static async deleteEmployee(employeeId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('employees')
        .delete()
        .eq('employee_id', employeeId);
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ─────────────────────────────────────────────
  // FINGERPRINT ENROLLMENT
  // ─────────────────────────────────────────────

  /**
   * Enroll fingerprint template for an employee.
   * templateRaw: raw feature string from the USB scanner SDK
   */
  static async enrollFingerprint(
    employeeId: string,
    templateRaw: string,
    fingerIndex: number,
    qualityScore: number,
    enrolledBy: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Deactivate any existing fingerprint for this employee/finger
      await supabase
        .from('employee_fingerprints')
        .update({ is_active: false })
        .eq('employee_id', employeeId)
        .eq('finger_index', fingerIndex);

      const templateHash = await sha256(templateRaw);
      const encryptedTemplate = encryptTemplate(templateRaw);
      const id = uid('fp');

      const { error } = await supabase
        .from('employee_fingerprints')
        .insert({
          id,
          employee_id: employeeId,
          template_data: encryptedTemplate,
          template_hash: templateHash,
          finger_index: fingerIndex,
          quality_score: qualityScore,
          is_active: true,
          enrolled_by: enrolledBy,
        });
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Match a scanned fingerprint template against all enrolled templates.
   * Returns the matched employee or null.
   * Uses template_hash for fast pre-filtering.
   */
  static async matchFingerprint(
    scannedTemplateRaw: string
  ): Promise<{ success: boolean; employee?: Employee; score?: number; error?: string }> {
    try {
      // Fast path: exact hash match
      const hash = await sha256(scannedTemplateRaw);
      const { data: exactMatch } = await supabase
        .from('employee_fingerprints')
        .select('employee_id, quality_score')
        .eq('template_hash', hash)
        .eq('is_active', true)
        .maybeSingle();

      if (exactMatch) {
        const { data: empRow } = await supabase
          .from('employees')
          .select('*')
          .eq('employee_id', exactMatch.employee_id)
          .eq('status', 'active')
          .single();
        if (empRow) return { success: true, employee: mapEmployee(empRow), score: 100 };
      }

      // Fallback: load all templates and do fuzzy matching
      const { data: allTemplates, error } = await supabase
        .from('employee_fingerprints')
        .select('*')
        .eq('is_active', true);

      if (error) throw error;
      if (!allTemplates || allTemplates.length === 0) {
        return { success: false, error: 'No fingerprints enrolled' };
      }

      let bestScore = 0;
      let bestEmployeeId = '';

      for (const row of allTemplates) {
        const decrypted = decryptTemplate(row.template_data);
        const score = HRController.computeSimilarity(scannedTemplateRaw, decrypted);
        if (score > bestScore) {
          bestScore = score;
          bestEmployeeId = row.employee_id;
        }
      }

      // Threshold: 85% similarity required
      if (bestScore < 85) {
        return { success: false, error: 'Fingerprint not recognized' };
      }

      const { data: empRow } = await supabase
        .from('employees')
        .select('*')
        .eq('employee_id', bestEmployeeId)
        .eq('status', 'active')
        .single();

      if (!empRow) return { success: false, error: 'Employee not found or inactive' };

      return { success: true, employee: mapEmployee(empRow), score: bestScore };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Simple character-level similarity (Hamming-like).
   * A real implementation uses Minutiae matching from the SDK.
   */
  private static computeSimilarity(a: string, b: string): number {
    if (a === b) return 100;
    const minLen = Math.min(a.length, b.length);
    if (minLen === 0) return 0;
    let matches = 0;
    for (let i = 0; i < minLen; i++) {
      if (a[i] === b[i]) matches++;
    }
    return Math.round((matches / Math.max(a.length, b.length)) * 100);
  }

  static async deleteFingerprint(employeeId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('employee_fingerprints')
        .update({ is_active: false })
        .eq('employee_id', employeeId);
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ─────────────────────────────────────────────
  // ATTENDANCE
  // ─────────────────────────────────────────────

  static async recordScan(
    employee: Employee,
    method: 'fingerprint' | 'manual' | 'pin' = 'fingerprint'
  ): Promise<{
    success: boolean;
    action?: 'check-in' | 'check-out';
    log?: AttendanceLog;
    statusLabel?: string;
    error?: string;
  }> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const now = new Date();
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const shiftStartMins = timeToMinutes(employee.shiftStart);
      const shiftEndMins = timeToMinutes(employee.shiftEnd);
      const allowedInMins = shiftStartMins - employee.earlyCheckinMinutes;
      const allowedOutMins = shiftEndMins + employee.lateCheckoutMinutes;

      // Fetch existing log for today
      const { data: existingLog } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('employee_id', employee.employeeId)
        .eq('log_date', today)
        .maybeSingle();

      if (!existingLog) {
        // ── CHECK IN ──
        if (nowMins < allowedInMins) {
          return { success: false, error: `Check-in not allowed before ${minutesToTime(allowedInMins)}` };
        }
        const lateMinutes = Math.max(0, nowMins - shiftStartMins);
        const status = lateMinutes > 0 ? 'late' : 'on-time';
        const id = uid('att');
        const { data: newLog, error } = await supabase
          .from('attendance_logs')
          .insert({
            id,
            employee_id: employee.employeeId,
            full_name: employee.fullName,
            log_date: today,
            check_in_time: now.toISOString(),
            scheduled_start: employee.shiftStart,
            scheduled_end: employee.shiftEnd,
            late_minutes: lateMinutes,
            early_leave_minutes: 0,
            overtime_minutes: 0,
            status,
            check_in_method: method,
            branch_id: employee.branchId,
          })
          .select()
          .single();
        if (error) throw error;
        return {
          success: true,
          action: 'check-in',
          log: mapAttendanceLog(newLog),
          statusLabel: lateMinutes > 0 ? `Late by ${lateMinutes} min` : 'On Time',
        };
      } else {
        // ── CHECK OUT ──
        if (existingLog.check_out_time) {
          return { success: false, error: 'Already checked out today' };
        }
        if (nowMins < timeToMinutes(employee.shiftStart)) {
          return { success: false, error: 'Cannot check out before shift starts' };
        }

        const checkInMins = (() => {
          const ci = new Date(existingLog.check_in_time);
          return ci.getHours() * 60 + ci.getMinutes();
        })();
        const workedMins = nowMins - checkInMins;
        const scheduledWorkMins = shiftEndMins - shiftStartMins;
        const earlyLeaveMinutes = Math.max(0, shiftEndMins - nowMins);
        const overtimeMinutes = Math.max(0, nowMins - allowedOutMins);
        const status = earlyLeaveMinutes > 0 ? 'early-leave' : existingLog.status;

        const { data: updatedLog, error } = await supabase
          .from('attendance_logs')
          .update({
            check_out_time: now.toISOString(),
            early_leave_minutes: earlyLeaveMinutes,
            overtime_minutes: overtimeMinutes,
            check_out_method: method,
            status,
          })
          .eq('id', existingLog.id)
          .select()
          .single();
        if (error) throw error;

        const label = earlyLeaveMinutes > 0
          ? `Early leave by ${earlyLeaveMinutes} min`
          : overtimeMinutes > 0
          ? `Overtime: ${overtimeMinutes} min`
          : 'Full shift completed';

        return {
          success: true,
          action: 'check-out',
          log: mapAttendanceLog(updatedLog),
          statusLabel: label,
        };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  static async getAttendanceLogs(
    filters: { date?: string; month?: number; year?: number; employeeId?: string } = {}
  ): Promise<{ success: boolean; data?: AttendanceLog[]; error?: string }> {
    try {
      let query = supabase.from('attendance_logs').select('*');

      if (filters.date) {
        query = query.eq('log_date', filters.date);
      } else if (filters.month && filters.year) {
        const start = `${filters.year}-${String(filters.month).padStart(2, '0')}-01`;
        const end = new Date(filters.year, filters.month, 0).toISOString().split('T')[0];
        query = query.gte('log_date', start).lte('log_date', end);
      }
      if (filters.employeeId) query = query.eq('employee_id', filters.employeeId);

      const { data, error } = await query.order('log_date', { ascending: false }).order('check_in_time', { ascending: false });
      if (error) throw error;
      return { success: true, data: (data || []).map(mapAttendanceLog) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ─────────────────────────────────────────────
  // PAYROLL
  // ─────────────────────────────────────────────

  static async computePayroll(
    employeeId: string,
    month: number,
    year: number,
    hrUserId: string
  ): Promise<{ success: boolean; data?: PayrollSummary; error?: string }> {
    try {
      const { data: empRow } = await supabase
        .from('employees')
        .select('*')
        .eq('employee_id', employeeId)
        .single();
      if (!empRow) return { success: false, error: 'Employee not found' };
      const employee = mapEmployee(empRow);

      // Get all attendance logs for the month
      const start = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = new Date(year, month, 0);
      const end = endDate.toISOString().split('T')[0];

      const { data: logs } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('employee_id', employeeId)
        .gte('log_date', start)
        .lte('log_date', end);

      const workingDays = endDate.getDate(); // simplified; can skip weekends
      const presentDays = (logs || []).filter(l => l.check_in_time).length;
      const absentDays = workingDays - presentDays;
      const totalLateMinutes = (logs || []).reduce((s, l) => s + (l.late_minutes || 0), 0);
      const totalOvertimeMinutes = (logs || []).reduce((s, l) => s + (l.overtime_minutes || 0), 0);

      // Deduction: 1 minute late = (salary / workingDays / 480) per minute
      const dailyRate = employee.monthlySalary / workingDays;
      const minuteRate = dailyRate / 480; // 8-hour workday
      const lateDeduction = Math.round(totalLateMinutes * minuteRate * 100) / 100;
      const overtimeBonus = Math.round(totalOvertimeMinutes * minuteRate * 1.5 * 100) / 100;
      const absentDeduction = absentDays * dailyRate;
      const netSalary = Math.max(0, employee.monthlySalary - lateDeduction - absentDeduction + overtimeBonus);

      const id = uid('pay');
      const { data: payRow, error } = await supabase
        .from('payroll_summary')
        .upsert({
          id,
          employee_id: employeeId,
          full_name: employee.fullName,
          month,
          year,
          monthly_salary: employee.monthlySalary,
          working_days: workingDays,
          present_days: presentDays,
          absent_days: absentDays,
          total_late_minutes: totalLateMinutes,
          total_overtime_minutes: totalOvertimeMinutes,
          late_deduction: lateDeduction,
          overtime_bonus: overtimeBonus,
          net_salary: netSalary,
          status: 'draft',
          branch_id: employee.branchId,
        }, { onConflict: 'employee_id,month,year' })
        .select()
        .single();

      if (error) throw error;
      return { success: true, data: mapPayroll(payRow) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  static async getPayroll(
    month: number,
    year: number
  ): Promise<{ success: boolean; data?: PayrollSummary[]; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('payroll_summary')
        .select('*')
        .eq('month', month)
        .eq('year', year)
        .order('full_name');
      if (error) throw error;
      return { success: true, data: (data || []).map(mapPayroll) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  static async approvePayroll(
    payrollId: string,
    approvedBy: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('payroll_summary')
        .update({ status: 'approved', approved_by: approvedBy, approved_at: new Date().toISOString() })
        .eq('id', payrollId);
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
