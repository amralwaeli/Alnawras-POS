import { Attendance, User } from '../models/types';

export class AttendanceController {
  /**
   * Record staff check-in
   */
  static checkIn(
    attendance: Attendance[],
    users: User[],
    employmentNumber: string,
    scheduledTime: Date = new Date(),
    location: { latitude: number; longitude: number } | null = null
  ): {
    success: boolean;
    attendance?: Attendance;
    staff?: User;
    error?: string;
  } {
    // Find staff by employment number
    const staff = users.find(u => u.employmentNumber === employmentNumber && u.status === 'active');

    if (!staff) {
      return {
        success: false,
        error: 'Invalid employment number or inactive account',
      };
    }

    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Check if already checked in today
    const existingCheckIn = attendance.find(
      a => a.employmentNumber === employmentNumber && a.date === today
    );

    if (existingCheckIn) {
      return {
        success: false,
        error: 'Already checked in today',
      };
    }

    // Calculate late minutes
    const checkInTime = now;
    const scheduled = new Date(scheduledTime);
    const diffMs = checkInTime.getTime() - scheduled.getTime();
    const lateMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));

    const newAttendance: Attendance = {
      id: `att-${Date.now()}`,
      employmentNumber: staff.employmentNumber,
      staffId: staff.id,
      staffName: staff.name,
      checkInTime,
      scheduledTime: scheduled,
      lateMinutes,
      branchId: staff.branchId,
      date: today,
    };

    return {
      success: true,
      attendance: newAttendance,
      staff,
    };
  }

  /**
   * Get attendance records for a date range
   */
  static getAttendanceByDateRange(
    attendance: Attendance[],
    startDate: string,
    endDate: string
  ): Attendance[] {
    return attendance.filter(a => a.date >= startDate && a.date <= endDate);
  }

  /**
   * Get today's attendance
   */
  static getTodayAttendance(attendance: Attendance[]): Attendance[] {
    const today = new Date().toISOString().split('T')[0];
    return attendance.filter(a => a.date === today);
  }

  /**
   * Get attendance by staff
   */
  static getAttendanceByStaff(
    attendance: Attendance[],
    staffId: string
  ): Attendance[] {
    return attendance.filter(a => a.staffId === staffId);
  }

  /**
   * Get late arrivals
   */
  static getLateArrivals(attendance: Attendance[]): Attendance[] {
    return attendance.filter(a => a.lateMinutes > 0);
  }

  /**
   * Verify location (simple distance check)
   * In production, you'd use geofencing or more sophisticated location verification
   */
  static verifyLocation(
    userLocation: { latitude: number; longitude: number },
    branchLocation: { latitude: number; longitude: number },
    maxDistanceMeters: number = 100
  ): boolean {
    // Haversine formula to calculate distance
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (userLocation.latitude * Math.PI) / 180;
    const φ2 = (branchLocation.latitude * Math.PI) / 180;
    const Δφ = ((branchLocation.latitude - userLocation.latitude) * Math.PI) / 180;
    const Δλ = ((branchLocation.longitude - userLocation.longitude) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = R * c;

    return distance <= maxDistanceMeters;
  }
}
