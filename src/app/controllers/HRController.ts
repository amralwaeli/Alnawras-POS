import { supabase } from '../../lib/supabase';
import { Employee, AttendanceLog, PayrollSummary } from '../models/types';
import { mapEmployee, mapFingerprint, mapAttendanceLog, mapPayroll } from '../models/mappers';
import { localDateStr, monthDateRange } from '../../lib/date';

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
      // Defence in depth: the admin role is never assignable to an employee.
      if (emp.role === 'admin') {
        return { success: false, error: 'The admin role cannot be assigned to an employee.' };
      }
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
      // Defence in depth: never let an employee be escalated to admin.
      if (updates.role === 'admin') {
        return { success: false, error: 'The admin role cannot be assigned to an employee.' };
      }
      const dbUpdates: any = {};
      if (updates.fullName !== undefined) dbUpdates.full_name = updates.fullName;
      if (updates.role !== undefined) dbUpdates.role = updates.role;
      if (updates.monthlySalary !== undefined) dbUpdates.monthly_salary = updates.monthlySalary;
      if (updates.shiftStart !== undefined) dbUpdates.shift_start = updates.shiftStart;
      if (updates.shiftEnd !== undefined) dbUpdates.shift_end = updates.shiftEnd;
      if (updates.earlyCheckinMinutes !== undefined) dbUpdates.early_checkin_minutes = updates.earlyCheckinMinutes;
      if (updates.lateCheckoutMinutes !== undefined) dbUpdates.late_checkout_minutes = updates.lateCheckoutMinutes;
      if (updates.status !== undefined) dbUpdates.status = updates.status;

      const { data: rows, error } = await supabase
        .from('employees')
        .update(dbUpdates)
        .eq('employee_id', employeeId)
        .select();
      if (error) throw error;
      const data = rows?.[0] ?? null;
      if (!data) throw new Error('Update failed: employee not found');
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
        const { data: empRows } = await supabase
          .from('employees')
          .select('*')
          .eq('employee_id', exactMatch.employee_id)
          .eq('status', 'active')
          .limit(1);
        const empRow = empRows?.[0] ?? null;
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

      const { data: empRows } = await supabase
        .from('employees')
        .select('*')
        .eq('employee_id', bestEmployeeId)
        .eq('status', 'active')
        .limit(1);
      const empRow = empRows?.[0] ?? null;

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
      const now = new Date();
      const today = localDateStr(now); // local business date, consistent with the clock math below
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const shiftStartMins = timeToMinutes(employee.shiftStart);
      const shiftEndMins = timeToMinutes(employee.shiftEnd);
      const allowedInMins = shiftStartMins - 30; // 30-minute rule
      const allowedOutMins = shiftEndMins + 30; // 30-minute rule

      // Fetch existing log for today
      const { data: existingLog } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('employee_id', employee.employeeId)
        .eq('log_date', today)
        .maybeSingle();

      if (!existingLog) {
        // ── AUTOMATED CHECK IN ──
        if (nowMins < allowedInMins) {
          return { success: false, error: `Too early. You can scan starting at ${minutesToTime(allowedInMins)}` };
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
          statusLabel: lateMinutes > 0 ? `Late by ${lateMinutes} min` : 'Clocked In',
        };
      } else {
        // ── AUTOMATED CHECK OUT ──
        if (existingLog.check_out_time) {
          return { success: false, error: 'Already clocked out for today' };
        }

        const checkInTime = new Date(existingLog.check_in_time);
        const minsSinceCheckIn = (now.getTime() - checkInTime.getTime()) / (1000 * 60);
        
        // Prevent accidental double-scan (ignore scans within 5 minutes of check-in)
        if (minsSinceCheckIn < 5) {
          return { success: false, error: 'Recently clocked in. Please wait a few minutes before clocking out.' };
        }

        const workedMins = Math.round(minsSinceCheckIn);
        const earlyLeaveMinutes = Math.max(0, shiftEndMins - nowMins);
        const overtimeMinutes = Math.max(0, nowMins - shiftEndMins);
        
        // ── AUTOMATED CHECK OUT WINDOW ENFORCEMENT ──
        if (nowMins > allowedOutMins) {
          return { success: false, error: `Too late. Clock-out was only allowed until ${minutesToTime(allowedOutMins)}` };
        }

        const { data: updatedLog, error } = await supabase
          .from('attendance_logs')
          .update({
            check_out_time: now.toISOString(),
            early_leave_minutes: earlyLeaveMinutes,
            overtime_minutes: overtimeMinutes,
            total_hours: (workedMins / 60).toFixed(2),
            status: earlyLeaveMinutes > 0 ? 'left-early' : 'completed'
          })
          .eq('id', existingLog.id)
          .select()
          .single();

        if (error) throw error;
        return {
          success: true,
          action: 'check-out',
          log: mapAttendanceLog(updatedLog),
          statusLabel: `Clocked Out. Worked: ${(workedMins / 60).toFixed(1)} hrs`,
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
        const { start, end } = monthDateRange(filters.year, filters.month);
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
      const { data: empRows } = await supabase
        .from('employees')
        .select('*')
        .eq('employee_id', employeeId)
        .limit(1);
      const empRow = empRows?.[0] ?? null;
      if (!empRow) return { success: false, error: 'Employee not found' };
      const employee = mapEmployee(empRow);

      // Get all attendance logs for the month (local business dates)
      const { start, end } = monthDateRange(year, month);
      const endDate = new Date(year, month, 0);

      const { data: logs } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('employee_id', employeeId)
        .gte('log_date', start)
        .lte('log_date', end);

      const workingDays = endDate.getDate(); // simplified; can skip weekends
      // OPTION A: Fixed salary. We only deduct for UNAUTHORIZED absences.
      // An unauthorized absence is a day where no log exists and it was NOT a rest day/authorized leave.
      // For now, we assume any calendar day without a log is an absence IF it's not a rest day.
      // Since we don't have a roster table yet, we count present days and any "absence" logs explicitly marked.
      const presentDays = (logs || []).filter(l => l.check_in_time).length;
      
      // In a fixed salary system, absentDays are days explicitly marked as "unauthorized absence".
      // If no explicit absence logs exist, absentDays = 0 (assuming they were rest days).
      const absentDays = (logs || []).filter(l => l.status === 'absent' || l.status === 'unauthorized').length;
      
      const totalLateMinutes = (logs || []).reduce((s, l) => s + (l.late_minutes || 0), 0);
      const totalOvertimeMinutes = (logs || []).reduce((s, l) => s + (l.overtime_minutes || 0), 0);

      // 30 days is the standard denominator for daily rate in MY/SG/ME payroll
      const dailyRate = employee.monthlySalary / 30;
      const minuteRate = dailyRate / 480; // 8-hour standard workday
      
      const lateDeduction = Math.round(totalLateMinutes * minuteRate * 100) / 100;
      const overtimeBonus = Math.round(totalOvertimeMinutes * minuteRate * 1.5 * 100) / 100;
      const absentDeduction = Math.round(absentDays * dailyRate * 100) / 100;
      
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
    year: number,
    branchId?: string
  ): Promise<{ success: boolean; data?: PayrollSummary[]; error?: string }> {
    try {
      let query = supabase
        .from('payroll_summary')
        .select('*')
        .eq('month', month)
        .eq('year', year);
      
      if (branchId) {
        query = query.eq('branch_id', branchId);
      }
      
      const { data, error } = await query.order('full_name');
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
