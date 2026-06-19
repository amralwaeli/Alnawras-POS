// ==================== Shared result envelope ====================

// Discriminated union returned by all async controller methods.
export type Result<T> = { success: true; data: T } | { success: false; error: string };

// ==================== User & Authentication ====================

export type UserRole = 'admin' | 'cashier' | 'waiter' | 'kitchen' | 'hr' | 'juice' | 'staff' | 'accounting' | 'manager' | 'supervisor';

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
  needsWaiter?: boolean;
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
  station: 'kitchen' | 'juice' | 'shawarma' | 'none';
  status: 'pending' | 'preparing' | 'ready' | 'served';
  notes?: string;
  sentToKitchen?: boolean;
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
  paymentStatus?: 'unpaid' | 'paid';
  orderType?: 'dine-in' | 'takeaway';
  createdAt: Date;
  completedAt?: Date;
  waiters: string[];
  cashierId?: string;
  cashierName?: string;
  paymentMethod?: string;
  billNumber?: string;
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
  station: 'kitchen' | 'juice' | 'shawarma' | 'none';
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
  revenueByCategory: {
    category: string;
    revenue: number;
    percentage: number;
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
  canViewOrderingDashboard: boolean; // Controls access to the menu/ordering UI
  canManageStaff: boolean;
  canManageAccounting: boolean;
  canExportReports: boolean;
  canImportProducts: boolean;
  canViewAttendance: boolean;
  canCheckIn: boolean;
  canManageInvoicesQuotations: boolean;
  canManagePayroll: boolean;
  canManageLeave: boolean;
  canViewOwnAttendance: boolean;
}

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  admin: {
    canViewTables: true,
    canAddOrders: true,
    canProcessPayments: true,
    canManageInventory: true,
    canViewReports: true,
    canViewOrderingDashboard: true,
    canManageStaff: true,
    canManageAccounting: true,
    canExportReports: true,
    canImportProducts: true,
    canViewAttendance: true,
    canCheckIn: true,
    canManageInvoicesQuotations: true,
    canManagePayroll: true,
    canManageLeave: true,
    canViewOwnAttendance: true,
  },
  cashier: {
    canViewTables: true,
    canAddOrders: false,
    canProcessPayments: true,
    canManageInventory: false,
    canViewReports: false,
    canViewOrderingDashboard: false,
    canManageStaff: false,
    canManageAccounting: false,
    canExportReports: false,
    canImportProducts: false,
    canViewAttendance: false,
    canCheckIn: true,
    canManageInvoicesQuotations: false,
    canManagePayroll: false,
    canManageLeave: false,
    canViewOwnAttendance: true,
  },
  waiter: {
    canViewTables: true,
    canAddOrders: true,
    canProcessPayments: false,
    canManageInventory: false,
    canViewReports: false,
    canViewOrderingDashboard: true,
    canManageStaff: false,
    canManageAccounting: false,
    canExportReports: false,
    canImportProducts: false,
    canViewAttendance: false,
    canCheckIn: true,
    canManageInvoicesQuotations: false,
    canManagePayroll: false,
    canManageLeave: false,
    canViewOwnAttendance: true,
  },
  kitchen: {
    canViewTables: false,
    canAddOrders: false,
    canProcessPayments: false,
    canManageInventory: true,
    canViewReports: false,
    canViewOrderingDashboard: false,
    canManageStaff: false,
    canManageAccounting: false,
    canExportReports: false,
    canImportProducts: false,
    canViewAttendance: false,
    canCheckIn: true,
    canManageInvoicesQuotations: false,
    canManagePayroll: false,
    canManageLeave: false,
    canViewOwnAttendance: true,
  },
  juice: {
    canViewTables: false,
    canAddOrders: false,
    canProcessPayments: false,
    canManageInventory: true,
    canViewReports: false,
    canViewOrderingDashboard: false,
    canManageStaff: false,
    canManageAccounting: false,
    canExportReports: false,
    canImportProducts: false,
    canViewAttendance: false,
    canCheckIn: true,
    canManageInvoicesQuotations: false,
    canManagePayroll: false,
    canManageLeave: false,
    canViewOwnAttendance: true,
  },
  hr: {
    canViewTables: false,
    canAddOrders: false,
    canProcessPayments: false,
    canManageInventory: false,
    canViewReports: false,
    canViewOrderingDashboard: false,
    canManageStaff: true,
    canManageAccounting: false,
    canExportReports: true,
    canImportProducts: false,
    canViewAttendance: true,
    canCheckIn: true,
    canManageInvoicesQuotations: false,
    canManagePayroll: true,
    canManageLeave: true,
    canViewOwnAttendance: true,
  },
  manager: {
    canViewTables: true,
    canAddOrders: true,
    canProcessPayments: true,
    canManageInventory: true,
    canViewReports: true,
    canViewOrderingDashboard: true,
    canManageStaff: true,
    canManageAccounting: false,
    canExportReports: true,
    canImportProducts: false,
    canViewAttendance: true,
    canCheckIn: true,
    canManageInvoicesQuotations: true,
    canManagePayroll: false,
    canManageLeave: true,
    canViewOwnAttendance: true,
  },
  supervisor: {
    canViewTables: true,
    canAddOrders: true,
    canProcessPayments: false,
    canManageInventory: true,
    canViewReports: true,
    canViewOrderingDashboard: true,
    canManageStaff: false,
    canManageAccounting: false,
    canExportReports: false,
    canImportProducts: false,
    canViewAttendance: true,
    canCheckIn: true,
    canManageInvoicesQuotations: false,
    canManagePayroll: false,
    canManageLeave: false,
    canViewOwnAttendance: true,
  },
  staff: {
    canViewTables: false,
    canAddOrders: false,
    canProcessPayments: false,
    canManageInventory: false,
    canViewReports: false,
    canViewOrderingDashboard: false,
    canManageStaff: false,
    canManageAccounting: false,
    canExportReports: false,
    canImportProducts: false,
    canViewAttendance: false,
    canCheckIn: true,
    canManageInvoicesQuotations: true,
    canManagePayroll: false,
    canManageLeave: false,
    canViewOwnAttendance: true,
  },
  accounting: {
    canViewTables: false,
    canAddOrders: false,
    canProcessPayments: false,
    canManageInventory: false,
    canViewReports: true,
    canViewOrderingDashboard: false,
    canManageStaff: false,
    canManageAccounting: true,
    canExportReports: true,
    canImportProducts: false,
    canViewAttendance: false,
    canCheckIn: true,
    canManageInvoicesQuotations: true,
    canManagePayroll: true,
    canManageLeave: false,
    canViewOwnAttendance: true,
  },
};

// ==================== HR & Fingerprint Attendance ====================

export interface Employee {
  id: string;
  userId?: string;
  employeeId: string;
  employeeNumber?: string;
  fullName: string;
  email?: string;
  phone?: string;
  role: string;
  department?: string;
  hireDate?: string;
  monthlySalary: number;
  shiftStart: string; // "HH:MM"
  shiftEnd: string;   // "HH:MM"
  earlyCheckinMinutes: number;
  lateCheckoutMinutes: number;
  status: 'active' | 'inactive';
  avatarUrl?: string;
  notes?: string;
  branchId: string;
  createdAt: Date;
  updatedAt: Date;
  hasFingerprint?: boolean;
}

// Unified view: employee + their user account data + live attendance snapshot
export interface EmployeeWithUser extends Employee {
  pin?: string;
  todayStatus?: 'present' | 'absent' | 'not-checked-in';
  todayCheckIn?: Date;
  todayCheckOut?: Date;
}

// Input for creating a new employee (creates both users + employees rows atomically)
export interface CreateEmployeeInput {
  fullName: string;
  email: string;
  phone?: string;
  role: Exclude<UserRole, 'admin'>;
  department?: string;
  pin: string;
  monthlySalary: number;
  shiftStart: string;
  shiftEnd: string;
  hireDate: string;
  branchId: string;
  notes?: string;
}

export type EmployeeFilters = {
  status?: 'active' | 'inactive' | 'all';
  role?: string;
  department?: string;
  search?: string;
};

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName?: string;
  leaveType: 'annual' | 'sick' | 'unpaid' | 'emergency' | 'other';
  startDate: string;
  endDate: string;
  daysCount: number;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: Date;
  branchId: string;
  createdAt: Date;
}

export type LeaveFilters = {
  employeeId?: string;
  status?: 'pending' | 'approved' | 'rejected' | 'all';
  month?: number;
  year?: number;
};

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

// ==================== Loyalty Program ====================

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  pointsBalance: number;
  totalSpent: number;
  totalVisits: number;
  branchId: string;
  createdAt: string;
}

export interface LoyaltyTransaction {
  id: string;
  customerId: string;
  customerName: string;
  orderId?: string;
  type: 'earn' | 'redeem' | 'adjust';
  points: number;
  description: string;
  branchId: string;
  createdAt: string;
}

export interface LoyaltySettings {
  enabled: boolean;
  pointsPerDollar: number;
  redemptionRate: number;
  minimumRedemption: number;
  pointsLabel: string;
}

export const DEFAULT_LOYALTY_SETTINGS: LoyaltySettings = {
  enabled: true,
  pointsPerDollar: 1,
  redemptionRate: 100,
  minimumRedemption: 100,
  pointsLabel: 'Points',
};

export function loadLoyaltySettings(): LoyaltySettings {
  try {
    const raw = localStorage.getItem('alnawras_loyalty_settings');
    if (!raw) return { ...DEFAULT_LOYALTY_SETTINGS };
    return { ...DEFAULT_LOYALTY_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_LOYALTY_SETTINGS };
  }
}

export function saveLoyaltySettings(s: LoyaltySettings) {
  localStorage.setItem('alnawras_loyalty_settings', JSON.stringify(s));
}

// ==================== Printers ====================

export type PrinterStation = string;

export interface Station {
  id: string;
  name: string;
  color: string;
  isBuiltIn: boolean;
}

export const DEFAULT_STATIONS: Station[] = [
  { id: 'kitchen', name: 'Kitchen',  color: '#f97316', isBuiltIn: true },
  { id: 'juice',   name: 'Juice Bar', color: '#22c55e', isBuiltIn: true },
];

export function loadStations(): Station[] {
  try {
    const raw = localStorage.getItem('alnawras_stations');
    if (!raw) return [...DEFAULT_STATIONS];
    return JSON.parse(raw);
  } catch {
    return [...DEFAULT_STATIONS];
  }
}

export function saveStations(stations: Station[]) {
  localStorage.setItem('alnawras_stations', JSON.stringify(stations));
}

export interface Printer {
  id: string;
  name: string;
  type: 'network' | 'usb';
  ipAddress?: string;
  port?: number;
  usbPath?: string;
  stations: PrinterStation[];
  isActive: boolean;
  branchId: string;
  createdAt: string;
}
