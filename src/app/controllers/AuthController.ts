import { User, RolePermissions, permissionsFor } from '../models/types';

export class AuthController {
  /**
   * Check if user has specific permission
   */
  static hasPermission(user: User | null, permission: keyof RolePermissions): boolean {
    if (!user) return false;
    return permissionsFor(user)[permission];
  }

  /**
   * Get all permissions for a role
   */
  static getPermissions(user: User): RolePermissions {
    return permissionsFor(user);
  }
}
