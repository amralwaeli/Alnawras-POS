import { User, ROLE_PERMISSIONS, RolePermissions } from '../models/types';
import { supabase } from '../../lib/supabase';
import { saveAuthSession } from '../../lib/authSession';

export class AuthController {
  /**
   * Authenticate user with PIN
   */
  static async authenticate(pin: string): Promise<{
    success: boolean;
    user?: User;
    error?: string;
  }> {
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return { success: false, error: 'PIN must be 4 digits' };
    }

    const { data, error } = await supabase
      .from('users')
      .select('id, name, employment_number, role, email, status, branch_id, created_at')
      .eq('pin', pin)
      .eq('status', 'active')
      .maybeSingle();

    if (error || !data) {
      return { success: false, error: 'Invalid PIN or inactive account' };
    }

    const user: User = {
      id: data.id,
      name: data.name,
      employmentNumber: data.employment_number,
      role: data.role,
      email: data.email,
      status: data.status,
      branchId: data.branch_id,
      createdAt: new Date(data.created_at),
      lastLogin: new Date(),
    };

    saveAuthSession({
      accessToken: 'direct-auth',
      expiresAt: Date.now() + 28800 * 1000,
      user,
    });

    return { success: true, user };
  }

  static async changePin(currentPin: string, newPin: string): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.functions.invoke('change-pin', { body: { currentPin, newPin } });
    if (error || data?.error) return { success: false, error: data?.error || error?.message || 'Failed to change PIN' };
    return { success: true };
  }

  /**
   * Check if user has specific permission
   */
  static hasPermission(user: User | null, permission: keyof RolePermissions): boolean {
    if (!user) return false;
    return ROLE_PERMISSIONS[user.role][permission];
  }

  /**
   * Get all permissions for a role
   */
  static getPermissions(user: User): RolePermissions {
    return ROLE_PERMISSIONS[user.role];
  }

}
