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
    if (pin.length < 6 || pin.length > 12 || !/^\d+$/.test(pin)) {
      return { success: false, error: 'PIN must be 6 to 12 digits' };
    }

    const { data, error } = await supabase.functions.invoke('pin-authenticate', { body: { pin } });
    if (error || !data?.user || !data?.access_token) {
      return { success: false, error: data?.error || error?.message || 'Invalid PIN or inactive account' };
    }

    const user = {
      id: data.user.id,
      name: data.user.name,
      employmentNumber: data.user.employment_number,
      role: data.user.role,
      email: data.user.email,
      status: data.user.status,
      branchId: data.user.branch_id,
      pinMustChange: data.user.pin_must_change,
      createdAt: new Date(data.user.created_at),
      lastLogin: new Date(),
    } as User;

    saveAuthSession({
      accessToken: data.access_token,
      expiresAt: Date.now() + Number(data.expires_in ?? 28800) * 1000,
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
