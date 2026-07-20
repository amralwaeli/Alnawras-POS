// ==================== Shared result envelope ====================

// Discriminated union returned by all async controller methods.
export type Result<T> = { success: true; data: T } | { success: false; error: string };

// ==================== User & Authentication ====================

export type UserRole = 'admin' | 'cashier' | 'waiter' | 'swaiter' | 'kitchen' | 'hr' | 'juice' | 'staff' | 'accounting' | 'manager' | 'supervisor';

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
  /** Whether customers may currently order from this table's QR code. A waiter
   *  turns this on after seating a party; it's automatically turned back off
   *  once the table's bill is paid. */
  orderingEnabled?: boolean;
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
  status: 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';
  notes?: string;
  sentToKitchen?: boolean;
  modifiers?: SelectedModifier[];
  cancelledByName?: string;
  cancelReason?: string;
  /** Set once this specific item has been settled via a split payment. */
  paid?: boolean;
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
  paymentStatus?: 'unpaid' | 'paid' | 'pending_verification' | 'rejected';
  orderType?: 'dine-in' | 'takeaway' | 'pickup';
  createdAt: Date;
  completedAt?: Date;
  waiters: string[];
  cashierId?: string;
  cashierName?: string;
  paymentMethod?: string;
  billNumber?: string;
  // ── Pickup-order fields (only set when orderType === 'pickup') ──
  pickupMethod?: 'grab' | 'lalamove' | 'self';
  pickupStatus?: 'preparing' | 'ready' | 'picked';
  pickupPayType?: 'cash' | 'online';
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  paymentReceiptUrl?: string;
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

// ── Modifiers ──────────────────────────────────────────────────────────────
export interface ModifierOption {
  id: string;
  groupId: string;
  name: string;
  addOnPrice: number;
  isDefault: boolean;
  displayOrder: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  /** 'single' → pick exactly one (radio); 'multiple' → pick many (checkbox). */
  type: 'single' | 'multiple';
  branchId: string;
  isActive: boolean;
  options: ModifierOption[];
  /** Ids of products this group is linked to (loaded on demand). */
  productIds?: string[];
  /** Convenience count for list views. */
  linkedProductCount?: number;
  createdAt: Date;
}

/** A modifier option chosen on a specific order line (snapshot). */
export interface SelectedModifier {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  /** Add-on price at the time of ordering. */
  price: number;
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

// ==================== Multi-tenant: Organizations & Branches ====================

/** The set of feature modules that can be toggled on/off per branch by the
 *  super-admin. Absent key = enabled (fail-open for older rows). */
export interface BranchFeatures {
  loyalty: boolean;
  workforce: boolean;
  biometrics: boolean;
  invoices: boolean;
  pickup: boolean;
  groupOrdering: boolean;
  reports: boolean;
  accounting: boolean;
}

export type BranchFeatureKey = keyof BranchFeatures;

export const ALL_FEATURES_ON: BranchFeatures = {
  loyalty: true, workforce: true, biometrics: true, invoices: true,
  pickup: true, groupOrdering: true, reports: true, accounting: true,
};

/** Human labels for the super-admin feature toggles. */
export const FEATURE_LABELS: Record<BranchFeatureKey, string> = {
  loyalty: 'Loyalty Program',
  workforce: 'Workforce / HR',
  biometrics: 'Biometric Attendance',
  invoices: 'Invoices & Quotations',
  pickup: 'Pickup Ordering',
  groupOrdering: 'Group QR Ordering',
  reports: 'Reports',
  accounting: 'Accounting',
};

export interface Organization {
  id: string;
  name: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  status: 'active' | 'suspended';
  createdAt: Date;
}

/** A one-tap discount the cashier can apply at payment, e.g. "Student" 10%.
 *  Configured per-branch by the tenant's own admin. */
export interface DiscountPreset {
  id: string;
  label: string;
  type: 'percentage' | 'fixed';
  value: number;
}

/** Per-branch business settings the tenant admin controls (tax + quick
 *  discounts). Stored in the DB per branch (migration 0020) so every device at
 *  the branch agrees. */
export interface BranchSettings {
  taxEnabled: boolean;
  /** Percentage, e.g. 6 = 6%. */
  taxRate: number;
  taxLabel: string;
  /** true = menu prices already include tax; false = tax added on top. */
  taxInclusive: boolean;
  discountPresets: DiscountPreset[];
}

export const DEFAULT_BRANCH_SETTINGS: BranchSettings = {
  taxEnabled: false,
  taxRate: 0,
  taxLabel: 'Tax',
  taxInclusive: false,
  discountPresets: [],
};

/** A billable restaurant location. `id` is the value used as `branch_id`
 *  across every other table. */
export interface Branch {
  id: string;
  orgId: string;
  name: string;
  contractStart?: string;
  contractEnd?: string;
  status: 'active' | 'suspended' | 'expired';
  features: BranchFeatures;
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
  /** Void/cancel an order item that's already been sent to the kitchen. */
  canVoidSentItems: boolean;
}

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  admin: {
    canVoidSentItems: true,
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
    canVoidSentItems: false,
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
    canVoidSentItems: false,
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
  // Super Waiter — a normal waiter that can ALSO manage invoices & quotations.
  swaiter: {
    // The "special waiter account" the void-item feature is gated on.
    canVoidSentItems: true,
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
    canManageInvoicesQuotations: true,
    canManagePayroll: false,
    canManageLeave: false,
    canViewOwnAttendance: true,
  },
  kitchen: {
    canVoidSentItems: false,
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
    canVoidSentItems: false,
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
    canVoidSentItems: false,
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
    canVoidSentItems: true,
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
    canVoidSentItems: false,
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
    canVoidSentItems: false,
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
    canVoidSentItems: false,
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

// ==================== Role Catalog (single source of truth) ====================
// Every screen (Add Employee form, filters, role badges) MUST read role labels,
// colours and the assignable list from here so they never drift apart again.

export interface RoleMeta {
  value: UserRole;
  label: string;
  /** Tailwind classes for the role badge pill. */
  badgeClass: string;
  /** Whether this role can be assigned to staff via the HR form (admin is not). */
  assignable: boolean;
}

// Ordered from most to least privileged for nice dropdowns.
export const ROLE_META: RoleMeta[] = [
  { value: 'admin',      label: 'Admin',        badgeClass: 'bg-gray-800 text-white',        assignable: false },
  { value: 'manager',    label: 'Manager',      badgeClass: 'bg-violet-100 text-violet-700', assignable: true },
  { value: 'supervisor', label: 'Supervisor',   badgeClass: 'bg-cyan-100 text-cyan-700',     assignable: true },
  { value: 'cashier',    label: 'Cashier',      badgeClass: 'bg-blue-100 text-blue-700',     assignable: true },
  { value: 'waiter',     label: 'Waiter',       badgeClass: 'bg-emerald-100 text-emerald-700', assignable: true },
  { value: 'swaiter',    label: 'Super Waiter', badgeClass: 'bg-emerald-200 text-emerald-900', assignable: true },
  { value: 'kitchen',    label: 'Kitchen',      badgeClass: 'bg-orange-100 text-orange-700',  assignable: true },
  { value: 'juice',      label: 'Juice Bar',    badgeClass: 'bg-yellow-100 text-yellow-700',  assignable: true },
  { value: 'accounting', label: 'Accountant',   badgeClass: 'bg-indigo-100 text-indigo-700',  assignable: true },
  { value: 'hr',         label: 'HR',           badgeClass: 'bg-pink-100 text-pink-700',      assignable: true },
  { value: 'staff',      label: 'Staff',        badgeClass: 'bg-teal-100 text-teal-700',      assignable: true },
];

/** Roles that can be picked when creating/editing an employee (everything but admin). */
export const ASSIGNABLE_ROLES = ROLE_META.filter(r => r.assignable);

export const ROLE_LABELS: Record<string, string> =
  Object.fromEntries(ROLE_META.map(r => [r.value, r.label]));

export const ROLE_BADGE_CLASSES: Record<string, string> =
  Object.fromEntries(ROLE_META.map(r => [r.value, r.badgeClass]));

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

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
