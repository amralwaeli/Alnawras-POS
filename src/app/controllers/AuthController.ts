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

  /**
   * Create new user (Admin only)
   */
  static createUser(
    users: User[],
    newUser: Omit<User, 'id' | 'createdAt'>,
    requestingUser: User
  ): {
    success: boolean;
    user?: User;
    error?: string;
  } {
    // Only admin can create users
    if (requestingUser.role !== 'admin') {
      return {
        success: false,
        error: 'Unauthorized: Only admins can create users',
      };
    }

    // Validate PIN
    if (newUser.pin.length !== 4 || !/^\d{4}$/.test(newUser.pin)) {
      return {
        success: false,
        error: 'PIN must be 4 digits',
      };
    }

    // Check for duplicate employment number
    const empExists = users.some(u => u.employmentNumber === newUser.employmentNumber);
    if (empExists) {
      return {
        success: false,
        error: 'Employment number already exists',
      };
    }

    // Check for duplicate email
    const emailExists = users.some(u => u.email === newUser.email);
    if (emailExists) {
      return {
        success: false,
        error: 'Email already exists',
      };
    }

    // Check for duplicate PIN
    const pinExists = users.some(u => u.pin === newUser.pin);
    if (pinExists) {
      return {
        success: false,
        error: 'PIN already in use',
      };
    }

    const user: User = {
      ...newUser,
      id: `user-${Date.now()}`,
      createdAt: new Date(),
    };

    return {
      success: true,
      user,
    };
  }

  /**
   * Update user (Admin only)
   */
  static updateUser(
    users: User[],
    userId: string,
    updates: Partial<Omit<User, 'id' | 'createdAt'>>,
    requestingUser: User
  ): {
    success: boolean;
    users?: User[];
    error?: string;
  } {
    if (requestingUser.role !== 'admin') {
      return {
        success: false,
        error: 'Unauthorized: Only admins can update users',
      };
    }

    const user = users.find(u => u.id === userId);
    if (!user) {
      return {
        success: false,
        error: 'User not found',
      };
    }

    // Validate PIN if being updated
    if (updates.pin && (updates.pin.length !== 4 || !/^\d{4}$/.test(updates.pin))) {
      return {
        success: false,
        error: 'PIN must be 4 digits',
      };
    }

    // Check for duplicate PIN if being updated
    if (updates.pin && updates.pin !== user.pin) {
      const pinExists = users.some(u => u.pin === updates.pin && u.id !== userId);
      if (pinExists) {
        return {
          success: false,
          error: 'PIN already in use',
        };
      }
    }

    const updatedUsers = users.map(u =>
      u.id === userId ? { ...u, ...updates } : u
    );

    return {
      success: true,
      users: updatedUsers,
    };
  }

  /**
   * Delete user (Admin only)
   */
  static deleteUser(
    users: User[],
    userId: string,
    requestingUser: User
  ): {
    success: boolean;
    users?: User[];
    error?: string;
  } {
    if (requestingUser.role !== 'admin') {
      return {
        success: false,
        error: 'Unauthorized: Only admins can delete users',
      };
    }

    const exists = users.some(u => u.id === userId);
    if (!exists) {
      return {
        success: false,
        error: 'User not found',
      };
    }

    return {
      success: true,
      users: users.filter(u => u.id !== userId),
    };
  }
}
