import { Staff } from '../models/types';

export class StaffController {
  /**
   * Get all staff members
   */
  static getStaff(staff: Staff[], activeOnly: boolean = false): Staff[] {
    if (activeOnly) {
      return staff.filter(s => s.status === 'active');
    }
    return staff;
  }

  /**
   * Get staff by ID
   */
  static getStaffById(staff: Staff[], staffId: string): Staff | undefined {
    return staff.find(s => s.id === staffId);
  }

  /**
   * Get staff by role
   */
  static getStaffByRole(
    staff: Staff[],
    role: 'manager' | 'cashier' | 'inventory'
  ): Staff[] {
    return staff.filter(s => s.role === role);
  }

  /**
   * Add new staff member
   */
  static addStaff(
    staff: Staff[],
    newStaff: Omit<Staff, 'id' | 'createdAt'>
  ): {
    success: boolean;
    updatedStaff?: Staff[];
    staff?: Staff;
    error?: string;
  } {
    // Check for duplicate email
    const emailExists = staff.some(s => s.email === newStaff.email);
    if (emailExists) {
      return {
        success: false,
        error: 'Email already exists',
      };
    }

    const staffMember: Staff = {
      ...newStaff,
      id: `staff-${Date.now()}`,
      createdAt: new Date(),
    };

    return {
      success: true,
      updatedStaff: [...staff, staffMember],
      staff: staffMember,
    };
  }

  /**
   * Update staff member
   */
  static updateStaff(
    staff: Staff[],
    staffId: string,
    updates: Partial<Omit<Staff, 'id' | 'createdAt'>>
  ): {
    success: boolean;
    updatedStaff?: Staff[];
    error?: string;
  } {
    const staffMember = staff.find(s => s.id === staffId);

    if (!staffMember) {
      return {
        success: false,
        error: 'Staff member not found',
      };
    }

    // Check for duplicate email if email is being updated
    if (updates.email && updates.email !== staffMember.email) {
      const emailExists = staff.some(s => s.email === updates.email && s.id !== staffId);
      if (emailExists) {
        return {
          success: false,
          error: 'Email already exists',
        };
      }
    }

    const updatedStaff = staff.map(s =>
      s.id === staffId ? { ...s, ...updates } : s
    );

    return {
      success: true,
      updatedStaff,
    };
  }

  /**
   * Deactivate staff member
   */
  static deactivateStaff(staff: Staff[], staffId: string): {
    success: boolean;
    updatedStaff?: Staff[];
    error?: string;
  } {
    return this.updateStaff(staff, staffId, { status: 'inactive' });
  }

  /**
   * Activate staff member
   */
  static activateStaff(staff: Staff[], staffId: string): {
    success: boolean;
    updatedStaff?: Staff[];
    error?: string;
  } {
    return this.updateStaff(staff, staffId, { status: 'active' });
  }

  /**
   * Delete staff member
   */
  static deleteStaff(staff: Staff[], staffId: string): {
    success: boolean;
    updatedStaff?: Staff[];
    error?: string;
  } {
    const exists = staff.some(s => s.id === staffId);

    if (!exists) {
      return {
        success: false,
        error: 'Staff member not found',
      };
    }

    return {
      success: true,
      updatedStaff: staff.filter(s => s.id !== staffId),
    };
  }

  /**
   * Get staff statistics
   */
  static getStaffStatistics(staff: Staff[]): {
    total: number;
    active: number;
    inactive: number;
    byRole: {
      role: string;
      count: number;
    }[];
    averageHourlyRate: number;
  } {
    const total = staff.length;
    const active = staff.filter(s => s.status === 'active').length;
    const inactive = staff.filter(s => s.status === 'inactive').length;

    const roleCount: Record<string, number> = {};
    staff.forEach(s => {
      roleCount[s.role] = (roleCount[s.role] || 0) + 1;
    });

    const byRole = Object.entries(roleCount).map(([role, count]) => ({
      role,
      count,
    }));

    const totalHourlyRate = staff.reduce((sum, s) => sum + s.hourlyRate, 0);
    const averageHourlyRate = total > 0
      ? Math.round((totalHourlyRate / total) * 100) / 100
      : 0;

    return {
      total,
      active,
      inactive,
      byRole,
      averageHourlyRate,
    };
  }
}
