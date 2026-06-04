import { User, ROLE_PERMISSIONS, RolePermissions } from '../models/types';

export class AuthController {
  /**
   * Authenticate user with PIN
   */
  static authenticate(pin: string, users: User[]): {
    success: boolean;
    user?: User;
    error?: string;
  } {
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return {
        success: false,
        error: 'PIN must be 4 digits',
      };
    }

    const user = users.find(u => u.pin === pin && u.status === 'active');

    if (!user) {
      return {
        success: false,
        error: 'Invalid PIN or inactive account',
      };
    }

    return {
      success: true,
      user: {
        ...user,
        lastLogin: new Date(),
      },
    };
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
