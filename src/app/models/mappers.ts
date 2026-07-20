/**
 * Canonical DB-row → domain-type mappers.
 *
 * One mapper per entity, the single snake_case→camelCase boundary for the
 * whole app. Import these everywhere a Supabase row is turned into a domain
 * object — never re-map inline. Typed against the reconciled schema
 * (supabase/migrations/0001_baseline.sql + 0002_workforce_reconcile.sql).
 */
import {
  Staff, Product, Category, Table, Order, OrderItem, Employee, LeaveRequest,
  AttendanceLog, EmployeeFingerprint, PayrollSummary, Customer, LoyaltyTransaction,
  ModifierGroup, ModifierOption, Organization, Branch, BranchFeatures, ALL_FEATURES_ON,
  BranchSettings, DiscountPreset, DEFAULT_BRANCH_SETTINGS,
} from './types';

// ── Multi-tenant: organizations & branches ───────────────────────────────────
export const mapOrganization = (row: any): Organization => ({
  id: row.id,
  name: row.name,
  ownerName: row.owner_name ?? undefined,
  ownerEmail: row.owner_email ?? undefined,
  ownerPhone: row.owner_phone ?? undefined,
  status: row.status ?? 'active',
  createdAt: row.created_at ? new Date(row.created_at) : new Date(),
});

export const mapBranchSettings = (row: any): BranchSettings => {
  if (!row) return { ...DEFAULT_BRANCH_SETTINGS };
  const presets: DiscountPreset[] = Array.isArray(row.discount_presets)
    ? row.discount_presets.map((p: any) => ({
        id: p.id ?? `d-${Math.random().toString(36).slice(2, 7)}`,
        label: String(p.label ?? 'Discount'),
        type: p.type === 'fixed' ? 'fixed' : 'percentage',
        value: Number(p.value ?? 0),
      }))
    : [];
  return {
    taxEnabled: row.tax_enabled ?? false,
    taxRate: Number(row.tax_rate ?? 0),
    taxLabel: row.tax_label ?? 'Tax',
    taxInclusive: row.tax_inclusive ?? false,
    discountPresets: presets,
  };
};

export const mapBranch = (row: any): Branch => ({
  id: row.id,
  orgId: row.org_id,
  name: row.name,
  contractStart: row.contract_start ?? undefined,
  contractEnd: row.contract_end ?? undefined,
  status: row.status ?? 'active',
  // Merge over the all-on default so a row missing a newer key fails open
  // (feature visible) rather than crashing on an undefined toggle.
  features: { ...ALL_FEATURES_ON, ...(row.enabled_features ?? {}) } as BranchFeatures,
  createdAt: row.created_at ? new Date(row.created_at) : new Date(),
});

// ── Catalog ──────────────────────────────────────────────────────────────────
export const mapProduct = (row: any): Product => ({
  id: row.id,
  name: row.name,
  categoryId: row.category_id ?? undefined,
  category: row.category,
  price: Number(row.price ?? 0),
  stock: row.stock ?? 0,
  image: row.image ?? undefined,
  sku: row.sku ?? undefined,
  taxRate: Number(row.tax_rate ?? 0),
  reorderPoint: row.reorder_point ?? 0,
  branchId: row.branch_id,
  station: row.station ?? 'kitchen',
  kitchenStatus: row.kitchen_status ?? 'available',
  availabilityStatus: row.availability_status ?? row.kitchen_status ?? 'available',
  isActive: row.is_active ?? true,
  createdAt: row.created_at ? new Date(row.created_at) : new Date(),
});

export const mapCategory = (row: any): Category => ({
  id: row.id,
  name: row.name,
  description: row.description ?? undefined,
  color: row.color,
  icon: row.icon ?? undefined,
  displayOrder: row.display_order ?? 0,
  isActive: row.is_active ?? true,
  branchId: row.branch_id,
  createdAt: row.created_at ? new Date(row.created_at) : new Date(),
});

// ── Tables & orders ──────────────────────────────────────────────────────────
export const mapTable = (row: any): Table => ({
  id: row.id,
  number: row.number,
  capacity: row.capacity,
  status: row.status,
  branchId: row.branch_id,
  currentOrderId: row.current_order_id ?? undefined,
  assignedCashierId: row.assigned_cashier_id ?? undefined,
  needsWaiter: row.needs_waiter ?? false,
  orderingEnabled: row.ordering_enabled ?? false,
});

export const mapOrderItem = (row: any): OrderItem => ({
  id: row.id,
  productId: row.product_id,
  productName: row.product_name,
  quantity: row.quantity,
  price: Number(row.price ?? 0),
  subtotal: Number(row.subtotal ?? 0),
  addedBy: row.added_by ?? 'guest',
  addedByName: row.added_by_name ?? 'Guest',
  addedAt: row.created_at ? new Date(row.created_at) : new Date(),
  station: row.station ?? 'kitchen',
  status: row.status ?? 'pending',
  notes: row.notes ?? undefined,
  sentToKitchen: row.sent_to_kitchen ?? undefined,
  cancelledByName: row.cancelled_by_name ?? undefined,
  cancelReason: row.cancel_reason ?? undefined,
  paid: row.paid ?? false,
  modifiers: Array.isArray(row.modifiers)
    ? row.modifiers.map((m: any) => ({
        groupId: m.groupId ?? m.group_id ?? '',
        groupName: m.groupName ?? m.group_name ?? '',
        optionId: m.optionId ?? m.option_id ?? '',
        optionName: m.optionName ?? m.option_name ?? '',
        price: Number(m.price ?? 0),
      }))
    : undefined,
});

// ── Modifiers ────────────────────────────────────────────────────────────────
export const mapModifierOption = (row: any): ModifierOption => ({
  id: row.id,
  groupId: row.group_id,
  name: row.name,
  addOnPrice: Number(row.add_on_price ?? 0),
  isDefault: row.is_default ?? false,
  displayOrder: row.display_order ?? 0,
});

export const mapModifierGroup = (row: any): ModifierGroup => ({
  id: row.id,
  name: row.name,
  type: row.type === 'multiple' ? 'multiple' : 'single',
  branchId: row.branch_id,
  isActive: row.is_active ?? true,
  options: (row.modifier_options ?? row.options ?? [])
    .map(mapModifierOption)
    .sort((a: ModifierOption, b: ModifierOption) => a.displayOrder - b.displayOrder),
  productIds: row.product_modifier_groups
    ? row.product_modifier_groups.map((l: any) => l.product_id)
    : undefined,
  linkedProductCount: typeof row.linked_product_count === 'number' ? row.linked_product_count : undefined,
  createdAt: row.created_at ? new Date(row.created_at) : new Date(),
});

export const mapOrder = (row: any): Order => ({
  id: row.id,
  tableId: row.table_id,
  tableNumber: row.table_number,
  items: (row.order_items ?? row.items ?? []).map(mapOrderItem),
  subtotal: Number(row.subtotal ?? 0),
  tax: Number(row.tax ?? 0),
  discount: Number(row.discount ?? 0),
  total: Number(row.total ?? 0),
  status: row.status,
  paymentStatus: row.payment_status ?? 'unpaid',
  orderType: row.order_type ?? 'dine-in',
  createdAt: row.created_at ? new Date(row.created_at) : new Date(),
  completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
  waiters: row.waiters ?? [],
  cashierId: row.cashier_id ?? undefined,
  cashierName: row.cashier_name ?? undefined,
  paymentMethod: row.payment_method ?? undefined,
  billNumber: row.bill_number ?? undefined,
  pickupMethod: row.pickup_method ?? undefined,
  pickupStatus: row.pickup_status ?? undefined,
  pickupPayType: row.pickup_pay_type ?? undefined,
  customerName: row.customer_name ?? undefined,
  customerPhone: row.customer_phone ?? undefined,
  customerEmail: row.customer_email ?? undefined,
  paymentReceiptUrl: row.payment_receipt_url ?? undefined,
});

// ── Staff / users ────────────────────────────────────────────────────────────
export const mapStaff = (row: any): Staff => ({
  id: row.id,
  name: row.name,
  employmentNumber: row.employment_number,
  role: row.role,
  pin: row.pin,
  email: row.email,
  status: row.status,
  branchId: row.branch_id,
  createdAt: new Date(row.created_at),
  hourlyRate: row.hourly_rate ?? 0,
  position: row.position ?? row.role,
  hireDate: row.hire_date ? new Date(row.hire_date) : new Date(row.created_at),
});

// ── Workforce ────────────────────────────────────────────────────────────────
export const mapEmployee = (row: any): Employee => ({
  id: row.id,
  userId: row.user_id ?? undefined,
  employeeId: row.employee_id,
  employeeNumber: row.employee_number ?? undefined,
  fullName: row.full_name,
  email: row.email ?? undefined,
  phone: row.phone ?? undefined,
  role: row.role,
  department: row.department ?? undefined,
  hireDate: row.hire_date ?? undefined,
  monthlySalary: Number(row.monthly_salary ?? 0),
  shiftStart: row.shift_start,
  shiftEnd: row.shift_end,
  earlyCheckinMinutes: row.early_checkin_minutes ?? 0,
  lateCheckoutMinutes: row.late_checkout_minutes ?? 0,
  status: row.status,
  avatarUrl: row.avatar_url ?? undefined,
  notes: row.notes ?? undefined,
  branchId: row.branch_id,
  createdAt: row.created_at ? new Date(row.created_at) : new Date(),
  updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
});

export const mapLeaveRequest = (row: any): LeaveRequest => ({
  id: row.id,
  employeeId: row.employee_id,
  employeeName: row.employees?.full_name ?? undefined,
  leaveType: row.leave_type,
  startDate: row.start_date,
  endDate: row.end_date,
  daysCount: row.days_count,
  reason: row.reason ?? undefined,
  status: row.status,
  reviewedBy: row.reviewed_by ?? undefined,
  reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : undefined,
  branchId: row.branch_id,
  createdAt: new Date(row.created_at),
});

export const mapAttendanceLog = (row: any): AttendanceLog => ({
  id: row.id,
  employeeId: row.employee_id,
  fullName: row.full_name,
  logDate: row.log_date,
  checkInTime: row.check_in_time ? new Date(row.check_in_time) : undefined,
  checkOutTime: row.check_out_time ? new Date(row.check_out_time) : undefined,
  scheduledStart: row.scheduled_start,
  scheduledEnd: row.scheduled_end,
  lateMinutes: row.late_minutes ?? 0,
  earlyLeaveMinutes: row.early_leave_minutes ?? 0,
  overtimeMinutes: row.overtime_minutes ?? 0,
  status: row.status,
  checkInMethod: row.check_in_method,
  checkOutMethod: row.check_out_method ?? undefined,
  notes: row.notes ?? undefined,
  branchId: row.branch_id,
});

export const mapFingerprint = (row: any): EmployeeFingerprint => ({
  id: row.id,
  employeeId: row.employee_id,
  templateData: row.template_data,
  templateHash: row.template_hash,
  fingerIndex: row.finger_index,
  qualityScore: row.quality_score,
  isActive: row.is_active,
  enrolledBy: row.enrolled_by,
  enrolledAt: new Date(row.enrolled_at),
});

export const mapPayroll = (row: any): PayrollSummary => ({
  id: row.id,
  employeeId: row.employee_id,
  fullName: row.full_name,
  month: row.month,
  year: row.year,
  monthlySalary: Number(row.monthly_salary ?? 0),
  workingDays: row.working_days,
  presentDays: row.present_days,
  absentDays: row.absent_days,
  totalLateMinutes: row.total_late_minutes,
  totalOvertimeMinutes: row.total_overtime_minutes,
  lateDeduction: Number(row.late_deduction ?? 0),
  overtimeBonus: Number(row.overtime_bonus ?? 0),
  netSalary: Number(row.net_salary ?? 0),
  status: row.status,
  approvedBy: row.approved_by ?? undefined,
  approvedAt: row.approved_at ? new Date(row.approved_at) : undefined,
  branchId: row.branch_id,
  createdAt: new Date(row.created_at),
});

// ── Loyalty ──────────────────────────────────────────────────────────────────
export const mapCustomer = (row: any): Customer => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  email: row.email ?? undefined,
  pointsBalance: row.points_balance ?? 0,
  totalSpent: Number(row.total_spent ?? 0),
  totalVisits: row.total_visits ?? 0,
  branchId: row.branch_id,
  createdAt: row.created_at,
});

export const mapLoyaltyTransaction = (row: any): LoyaltyTransaction => ({
  id: row.id,
  customerId: row.customer_id,
  customerName: row.customers?.name ?? '',
  orderId: row.order_id ?? undefined,
  type: row.type,
  points: row.points,
  description: row.description,
  branchId: row.branch_id,
  createdAt: row.created_at,
});
