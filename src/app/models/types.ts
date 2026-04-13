// Enhanced data models for POS system with RBAC

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
  // This tells the UI whether to show this item on the Kitchen screen or Juice screen
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
  // Route product to specific display
  station: 'kitchen' | 'juice' | 'none'; 
  // Renamed from kitchenStatus to be more generic
  availabilityStatus: 'available' | 'out-of-stock' | 'finished'; 
  isActive: boolean;
  createdAt: Date;
}

export interface InventoryItem {
  productId: string;
  productName: string;
  stockLevel: number;
  reorderPoint: number;
  lastUpdated: Date;
  status: 'in-stock' | 'low-stock' | 'out-of-stock';
  // Staff at Juice or Kitchen can mark items finished
  availabilityStatus: 'available' | 'out-of-stock' | 'finished';
}

// ==================== Payments ====================

export type PaymentMethod = 'cash' | 'card' | 'qr' | 'mixed';

export interface PaymentBreakdown {
  cash?: number;
  card?: number;
  qr?: number;
}

export interface Payment {
  id: string;
  orderId: string;
  tableId: string;
  amount: number;
  method: PaymentMethod;
  breakdown?: PaymentBreakdown; 
  status: 'completed' | 'pending' | 'failed';
  processedBy: string; 
  processedByName: string;
  timestamp: Date;
}

// ==================== Accounting ====================

export interface Expense {
  id: string;
  description: string;
  category: 'utilities' | 'supplies' | 'salary' | 'rent' | 'maintenance' | 'other';
  amount: number;
  date: Date;
  createdBy: string; 
  branchId: string;
  receipt?: string; 
}

export interface DailyAccounting {
  date: string; 
  branchId: string;
  totalSales: number;
  totalExpenses: number;
  netIncome: number;
  orderCount: number;
  paymentMethods: {
    cash: number;
    card: number;
    qr: number;
  };
}

// ==================== Staff & Attendance ====================

export interface Attendance {
  id: string;
  employmentNumber: string;
  staffId: string;
  staffName: string;
  checkInTime: Date;
  checkOutTime?: Date;
  scheduledTime: Date;
  lateMinutes: number; 
  branchId: string;
  date: string; 
}

export interface Staff extends User {
  hourlyRate?: number;
  position: string;
  hireDate: Date;
}

// ==================== Branch ====================

export interface Branch {
  id: string;
  name: string;
  location: string;
  managerId: string;
  isActive: boolean;
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
    canManageInventory: true, // Kitchen can manage their stock/status
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
    canManageInventory: true, // Juice bar can manage their stock/status
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
