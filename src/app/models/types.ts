// Enhanced data models for POS system with RBAC

// ==================== User & Authentication ====================

export type UserRole = 'admin' | 'cashier' | 'waiter' | 'kitchen' | 'hr';

export interface User {
  id: string;
  name: string;
  employmentNumber: string; // Used for staff check-in
  role: UserRole;
  pin: string; // 4-digit PIN for login
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
  assignedCashierId?: string; // For payment processing
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  subtotal: number;
  addedBy: string; // Waiter ID
  addedByName: string; // Waiter name
  addedAt: Date;
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
  waiters: string[]; // List of waiter IDs who added items
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
  kitchenStatus: 'available' | 'out-of-stock' | 'finished'; // Kitchen can mark
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
  kitchenStatus: 'available' | 'out-of-stock' | 'finished';
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
  breakdown?: PaymentBreakdown; // For mixed payments
  status: 'completed' | 'pending' | 'failed';
  processedBy: string; // Cashier ID
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
  createdBy: string; // Admin ID
  branchId: string;
  receipt?: string; // File path or URL
}

export interface DailyAccounting {
  date: string; // YYYY-MM-DD
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
  lateMinutes: number; // Calculated automatically
  branchId: string;
  date: string; // YYYY-MM-DD
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

// ==================== Analytics ====================

export interface SalesAnalytics {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  itemsSold: number;
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
  waiterPerformance: {
    waiterId: string;
    waiterName: string;
    ordersServed: number;
    itemsAdded: number;
    totalRevenue: number;
  }[];
}

// ==================== Import/Export ====================

export interface ProductImportData {
  name: string;
  category: string;
  categoryId?: string;
  price: number;
  stock: number;
  sku?: string;
  taxRate: number;
  reorderPoint: number;
  image?: string;
}

export interface ExportReport {
  type: 'daily' | 'weekly' | 'monthly';
  startDate: string;
  endDate: string;
  format: 'pdf' | 'excel';
  data: {
    sales: DailyAccounting[];
    expenses: Expense[];
    summary: {
      totalSales: number;
      totalExpenses: number;
      netIncome: number;
    };
  };
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
  hr: {
    canViewTables: false,
    canAddOrders: false,
    canProcessPayments: false,
    canManageInventory: false,
    canViewReports: false,
    canManageStaff: false,
    canManageAccounting: false,
    canExportReports: false,
    canImportProducts: false,
    canViewAttendance: true,
    canCheckIn: true,
  },
};
