// ==================== User & Authentication ====================

export type UserRole = 'admin' | 'cashier' | 'waiter' | 'kitchen' | 'hr' | 'juice';

export interface User {
  id: string;
  name: string;
  employmentNumber: string;
  role: UserRole;
  pin: string;
  email: string;
  status: 'active' | 'inactive';
  branchId: string;
  createdAt: Date;
  lastLogin?: Date;
}

export interface Staff extends User {
  hourlyRate?: number;
  position: string;
  hireDate: Date;
}

// ==================== Tables & Orders ====================

export interface Table {
  id: string;
  number: number;
  capacity: number;
  status: 'available' | 'occupied' | 'reserved';
  branchId: string;
  currentOrderId?: string;
  assignedCashierId?: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  subtotal: number;
  addedBy: string;
  addedByName: string;
  addedAt: Date;
  station: 'kitchen' | 'juice' | 'none';
  status: 'pending' | 'preparing' | 'ready' | 'served';
  notes?: string;
}

export interface Order {
  id: string;
  tableId: string;
  tableNumber: number;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  status: 'open' | 'completed' | 'cancelled';
  createdAt: Date;
  completedAt?: Date;
  waiters: string[];
  cashierId?: string;
  cashierName?: string;
  paymentMethod?: string;
}

// ==================== Products & Inventory ====================

export interface Category {
  id: string;
  name: string;
  description?: string;
  color: string;
  icon?: string;
  displayOrder: number;
  isActive: boolean;
  branchId: string;
  createdAt: Date;
}

export interface Product {
  id: string;
  name: string;
  categoryId?: string;
  category: string;
  price: number;
  stock: number;
  image?: string;
  sku?: string;
  taxRate: number;
  reorderPoint: number;
  branchId: string;
  station: 'kitchen' | 'juice' | 'none';
  kitchenStatus: 'available' | 'out-of-stock' | 'finished';
  availabilityStatus: 'available' | 'out-of-stock' | 'finished';
  isActive: boolean;
  createdAt: Date;
}

export interface ProductImportData {
  name: string;
  category?: string;
  price?: number;
  stock?: number;
  image?: string;
  sku?: string;
  taxRate?: number;
  reorderPoint?: number;
}

export interface InventoryItem {
  id: string;
  productId: string;
  productName: string;
  branchId: string;
  currentStock: number;
  reorderPoint: number;
  lastUpdated: Date;
  notes?: string;
}

// ==================== Attendance & Expenses ====================

export interface Attendance {
  id: string;
  userId: string;
  userName: string;
  branchId: string;
  checkIn: Date;
  checkOut?: Date;
  hoursWorked?: number;
  status: 'present' | 'absent' | 'late' | 'half-day';
  notes?: string;
}

export interface Expense {
  id: string;
  branchId: string;
  category: string;
  description: string;
  amount: number;
  date: Date;
  createdBy: string;
  createdByName: string;
  receipt?: string;
  status: 'pending' | 'approved' | 'rejected';
}

// ==================== Branch ====================

export interface Branch {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  createdAt: Date;
}

// ==================== Analytics ====================

export interface SalesAnalytics {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  topProducts: {
    productId: string;
    productName: string;
    quantitySold: number;
    revenue: number;
  }[];
  revenueByDay: {
    date: string;
    revenue: number;
    orders: number;
  }[];
  paymentMethodBreakdown: {
    method: string;
    count: number;
    totalAmount: number;
    percentage: number;
  }[];
}

// ==================== Permissions ====================

export interface RolePermissions {
  canViewTables: boolean;
  canAddOrders: boolean;
  canProcessPayments: boolean;
  canManageInventory: boolean;
  canViewReports: boolean;
  canManageStaff: boolean;
  canManageAccounting: boolean;
  canExportReports: boolean;
  canImportProducts: boolean;
  canViewAttendance: boolean;
  canCheckIn: boolean;
}

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  admin: {
    canViewTables: true,
    canAddOrders: true,
    canProcessPayments: true,
    canManageInventory: true,
    canViewReports: true,
    canManageStaff: true,
    canManageAccounting: true,
    canExportReports: true,
    canImportProducts: true,
    canViewAttendance: true,
    canCheckIn: true,
  },
  cashier: {
    canViewTables: true,
    canAddOrders: false,
    canProcessPayments: true,
    canManageInventory: false,
    canViewReports: false,
    canManageStaff: false,
    canManageAccounting: false,
    canExportReports: false,
    canImportProducts: false,
    canViewAttendance: false,
    canCheckIn: true,
  },
  waiter: {
    canViewTables: true,
    canAddOrders: true,
    canProcessPayments: false,
    canManageInventory: false,
    canViewReports: false,
    canManageStaff: false,
    canManageAccounting: false,
    canExportReports: false,
    canImportProducts: false,
    canViewAttendance: false,
    canCheckIn: true,
  },
  kitchen: {
    canViewTables: false,
    canAddOrders: false,
    canProcessPayments: false,
    canManageInventory: true,
    canViewReports: false,
    canManageStaff: false,
    canManageAccounting: false,
    canExportReports: false,
    canImportProducts: false,
    canViewAttendance: false,
    canCheckIn: true,
  },
  juice: {
    canViewTables: false,
    canAddOrders: false,
    canProcessPayments: false,
    canManageInventory: true,
    canViewReports: false,
    canManageStaff: false,
    canManageAccounting: false,
    canExportReports: false,
    canImportProducts: false,
    canViewAttendance: false,
    canCheckIn: true,
  },
  hr: {
    canViewTables: false,
    canAddOrders: false,
    canProcessPayments: false,
    canManageInventory: false,
    canViewReports: false,
    canManageStaff: true,
    canManageAccounting: false,
    canExportReports: false,
    canImportProducts: false,
    canViewAttendance: true,
    canCheckIn: true,
  },
};

// ==================== HR & Fingerprint Attendance ====================

export interface Employee {
  id: string;
  userId?: string;
  employeeId: string;
  fullName: string;
  role: string;
  monthlySalary: number;
  shiftStart: string; // "HH:MM"
  shiftEnd: string;   // "HH:MM"
  earlyCheckinMinutes: number;
  lateCheckoutMinutes: number;
  status: 'active' | 'inactive';
  branchId: string;
  createdAt: Date;
  updatedAt: Date;
  hasFingerprint?: boolean;
}

export interface EmployeeFingerprint {
  id: string;
  employeeId: string;
  templateData: string;  // AES-encrypted, Base64
  templateHash: string;  // SHA-256 for fast matching
  fingerIndex: number;
  qualityScore: number;
  isActive: boolean;
  enrolledBy: string;
  enrolledAt: Date;
}

export interface AttendanceLog {
  id: string;
  employeeId: string;
  fullName: string;
  logDate: string;          // "YYYY-MM-DD"
  checkInTime?: Date;
  checkOutTime?: Date;
  scheduledStart: string;   // "HH:MM"
  scheduledEnd: string;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  status: 'present' | 'absent' | 'late' | 'on-time' | 'early-leave';
  checkInMethod: 'fingerprint' | 'manual' | 'pin';
  checkOutMethod?: 'fingerprint' | 'manual' | 'pin';
  notes?: string;
  branchId: string;
}

export interface PayrollSummary {
  id: string;
  employeeId: string;
  fullName: string;
  month: number;
  year: number;
  monthlySalary: number;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  totalLateMinutes: number;
  totalOvertimeMinutes: number;
  lateDeduction: number;
  overtimeBonus: number;
  netSalary: number;
  status: 'draft' | 'approved' | 'paid';
  approvedBy?: string;
  approvedAt?: Date;
  branchId: string;
  createdAt: Date;
}

export interface ShiftRule {
  id: string;
  employeeId: string;
  effectiveDate: string;
  shiftStart: string;
  shiftEnd: string;
  earlyCheckinMinutes: number;
  lateCheckoutMinutes: number;
  createdBy: string;
}

// Fingerprint scanner status
export type ScannerStatus = 'disconnected' | 'ready' | 'scanning' | 'processing' | 'error';
