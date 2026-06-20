import { lazy, Suspense } from 'react';
import { createHashRouter, Navigate } from 'react-router';
import { Layout } from './components/Layout';
import { usePOS } from './context/POSContext';
import { ROLE_PERMISSIONS } from './models/types';
import { ProductManagementView } from './modules/staff';

function ProtectedRoute({ children, permission, adminOnly }: {
  children: React.ReactNode;
  permission?: keyof typeof ROLE_PERMISSIONS['admin'];
  adminOnly?: boolean;
}) {
  const { currentUser } = usePOS();
  if (!currentUser) return <Navigate to="/check-in" replace />;
  if (adminOnly && currentUser.role !== 'admin') return <Navigate to="/" replace />;
  if (permission && !ROLE_PERMISSIONS[currentUser.role]?.[permission]) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// ── Lazy-load each module ─────────────────────────────────────────────────────
const AdminDashboardView     = lazy(() => import('./modules/dashboard').then(m => ({ default: m.AdminDashboardView })));
const DashboardView          = lazy(() => import('./modules/dashboard').then(m => ({ default: m.DashboardView })));

const TablesView             = lazy(() => import('./modules/tables').then(m => ({ default: m.TablesView })));
const TableManagementView    = lazy(() => import('./modules/tables').then(m => ({ default: m.TableManagementView })));
const TableOrderingView      = lazy(() => import('./modules/tables').then(m => ({ default: m.TableOrderingView })));
const QROrderingView         = lazy(() => import('./modules/tables').then(m => ({ default: m.QROrderingView })));
const SecureQROrderingView   = lazy(() => import('./modules/tables').then(m => ({ default: m.SecureQROrderingView })));
const GroupOrderingView      = lazy(() => import('./modules/tables/GroupOrderingView').then(m => ({ default: m.GroupOrderingView })));
const TableQRView            = lazy(() => import('./modules/tables').then(m => ({ default: m.TableQRView })));
const TableRedirectView      = lazy(() => import('./modules/tables').then(m => ({ default: m.TableRedirectView })));

const KitchenView            = lazy(() => import('./modules/kitchen').then(m => ({ default: m.KitchenView })));

const InventoryView          = lazy(() => import('./modules/inventory').then(m => ({ default: m.InventoryView })));

const CategoryManagementView = lazy(() => import('./modules/staff').then(m => ({ default: m.CategoryManagementView })));
const PrinterManagementView  = lazy(() => import('./modules/staff').then(m => ({ default: m.PrinterManagementView })));

// ── Workforce module ──────────────────────────────────────────────────────────
const WorkforceLayout        = lazy(() => import('./modules/workforce').then(m => ({ default: m.WorkforceLayout })));
const EmployeesView          = lazy(() => import('./modules/workforce').then(m => ({ default: m.EmployeesView })));
const EmployeeProfileView    = lazy(() => import('./modules/workforce').then(m => ({ default: m.EmployeeProfileView })));
const WorkforceAttendanceView = lazy(() => import('./modules/workforce').then(m => ({ default: m.WorkforceAttendanceView })));
const PayrollView            = lazy(() => import('./modules/workforce').then(m => ({ default: m.PayrollView })));
const LeaveManagementView    = lazy(() => import('./modules/workforce').then(m => ({ default: m.LeaveManagementView })));
const BiometricsView         = lazy(() => import('./modules/workforce').then(m => ({ default: m.BiometricsView })));

// ── Fingerprint kiosk (standalone, no layout) ────────────────────────────────
const FingerprintCheckInView = lazy(() => import('./modules/hr').then(m => ({ default: m.FingerprintCheckInView })));

const ReportsView            = lazy(() => import('./modules/reports').then(m => ({ default: m.ReportsView })));

const AccountingView         = lazy(() => import('./modules/accounting').then(m => ({ default: m.AccountingView })));
const BillFormatView         = lazy(() => import('./modules/accounting').then(m => ({ default: m.BillFormatView })));
const ShiftManagementView    = lazy(() => import('./modules/accounting/ShiftManagementView').then(m => ({ default: m.ShiftManagementView })));
const QuotationsView         = lazy(() => import('./modules/quotations').then(m => ({ default: m.QuotationsView })));
const InvoicesView           = lazy(() => import('./modules/invoices').then(m => ({ default: m.InvoicesView })));

const PickupOrderingView     = lazy(() => import('./modules/pickup/PickupOrderingView').then(m => ({ default: m.PickupOrderingView })));
const PickupBoardView         = lazy(() => import('./modules/pickup/PickupBoardView').then(m => ({ default: m.PickupBoardView })));
const CheckInView            = lazy(() => import('./modules/auth').then(m => ({ default: m.CheckInView })));
const CustomerMenuView       = lazy(() => import('./modules/menu').then(m => ({ default: m.CustomerMenuView })));
const LoyaltyManagementView  = lazy(() => import('./modules/loyalty').then(m => ({ default: m.LoyaltyManagementView })));
const CustomerMonitorView    = lazy(() => import('./modules/shared/CustomerMonitorView').then(m => ({ default: m.CustomerMonitorView })));

// ── Loading fallback ──────────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full min-h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500 font-bold uppercase tracking-widest">Loading POS...</p>
      </div>
    </div>
  );
}

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

// ── Role-aware landing page ───────────────────────────────────────────────────
function LandingPage() {
  const { currentUser } = usePOS();
  if (!currentUser) return <Navigate to="/check-in" replace />;

  switch (currentUser.role) {
    // ── POS / Floor roles ──────────────────────────────────────────────────
    case 'admin':      return <Navigate to="/admin-dashboard" replace />;
    case 'cashier':    return <Navigate to="/tables" replace />;
    case 'waiter':     return <Navigate to="/dashboard" replace />;   // ordering menu
    case 'swaiter':    return <Navigate to="/dashboard" replace />;   // super waiter — same landing as waiter
    case 'kitchen':    return <Navigate to="/kitchen" replace />;
    case 'juice':      return <Navigate to="/kitchen" replace />;

    // ── Management roles ───────────────────────────────────────────────────
    case 'manager':    return <Navigate to="/admin-dashboard" replace />;
    case 'supervisor': return <Navigate to="/reports" replace />;

    // ── Back-office roles — NEVER see the ordering menu ───────────────────
    case 'accounting': return <Navigate to="/accounting" replace />;
    case 'hr':         return <Navigate to="/workforce/employees" replace />;
    case 'staff':      return <Navigate to="/invoices" replace />;

    default:           return <Navigate to="/admin-dashboard" replace />;
  }
}

export const router = createHashRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, element: <Lazy><LandingPage /></Lazy> },

      // ── Dashboard ──
      { path: 'dashboard',           element: <Lazy><ProtectedRoute permission="canViewOrderingDashboard"><CustomerMenuView /></ProtectedRoute></Lazy> },
      { path: 'admin-dashboard',     element: <Lazy><ProtectedRoute permission="canViewReports"><AdminDashboardView /></ProtectedRoute></Lazy> },

      // ── Tables ──
      { path: 'tables',              element: <Lazy><ProtectedRoute permission="canViewTables"><TablesView /></ProtectedRoute></Lazy> },
      { path: 'table-management',    element: <Lazy><ProtectedRoute adminOnly><TableManagementView /></ProtectedRoute></Lazy> },

      // ── Takeaway ordering (cashier-accessible, takeaway-only) ──
      { path: 'takeaway',            element: <Lazy><ProtectedRoute permission="canViewTables"><CustomerMenuView takeawayOnly /></ProtectedRoute></Lazy> },

      // ── Pickup orders board (cashier / admin / super-waiter) ──
      { path: 'pickup-orders',       element: <Lazy><ProtectedRoute permission="canViewTables"><PickupBoardView /></ProtectedRoute></Lazy> },

      // ── Menu / Products ──
      { path: 'product-management',  element: <Lazy><ProtectedRoute adminOnly><ProductManagementView /></ProtectedRoute></Lazy> },
      { path: 'manage-menu',         element: <Lazy><ProtectedRoute adminOnly><CategoryManagementView /></ProtectedRoute></Lazy> },
      { path: 'category-management', element: <Navigate to="/manage-menu" replace /> },
      { path: 'printers',            element: <Lazy><ProtectedRoute adminOnly><PrinterManagementView /></ProtectedRoute></Lazy> },

      // ── Kitchen ──
      { path: 'kitchen',             element: <Lazy><ProtectedRoute permission="canManageInventory"><KitchenView /></ProtectedRoute></Lazy> },

      // ── Inventory ──
      { path: 'inventory',           element: <Lazy><ProtectedRoute permission="canManageInventory"><InventoryView /></ProtectedRoute></Lazy> },

      // ── Reports ──
      { path: 'reports',             element: <Lazy><ProtectedRoute permission="canViewReports"><ReportsView /></ProtectedRoute></Lazy> },

      // ── Accounting ──
      { path: 'accounting',          element: <Lazy><ProtectedRoute permission="canManageAccounting"><AccountingView /></ProtectedRoute></Lazy> },
      { path: 'bill-format',         element: <Lazy><ProtectedRoute permission="canManageAccounting"><BillFormatView /></ProtectedRoute></Lazy> },
      { path: 'shifts',              element: <Lazy><ProtectedRoute permission="canManageAccounting"><ShiftManagementView /></ProtectedRoute></Lazy> },
      { path: 'quotations', element: <Lazy><ProtectedRoute permission="canManageInvoicesQuotations"><QuotationsView /></ProtectedRoute></Lazy> },
      { path: 'invoices',   element: <Lazy><ProtectedRoute permission="canManageInvoicesQuotations"><InvoicesView /></ProtectedRoute></Lazy> },

      // ── Workforce (unified module) ──
      {
        path: 'workforce',
        element: (
          <Lazy>
            <ProtectedRoute permission="canManageStaff">
              <WorkforceLayout />
            </ProtectedRoute>
          </Lazy>
        ),
        children: [
          { index: true, element: <Navigate to="employees" replace /> },
          { path: 'employees',  element: <Lazy><EmployeesView /></Lazy> },
          { path: 'employees/:employeeId', element: <Lazy><EmployeeProfileView /></Lazy> },
          { path: 'attendance', element: <Lazy><WorkforceAttendanceView /></Lazy> },
          { path: 'payroll',    element: <Lazy><ProtectedRoute permission="canManagePayroll"><PayrollView /></ProtectedRoute></Lazy> },
          { path: 'leave',      element: <Lazy><ProtectedRoute permission="canManageLeave"><LeaveManagementView /></ProtectedRoute></Lazy> },
          { path: 'biometrics', element: <Lazy><BiometricsView /></Lazy> },
        ],
      },

      // ── Legacy redirects (keep old bookmarks working) ──
      { path: 'staff',      element: <Navigate to="/workforce/employees" replace /> },
      { path: 'hr-panel',   element: <Navigate to="/workforce/employees" replace /> },
      { path: 'attendance', element: <Navigate to="/workforce/attendance" replace /> },

      // ── Loyalty ──
      { path: 'loyalty',             element: <Lazy><ProtectedRoute adminOnly><LoyaltyManagementView /></ProtectedRoute></Lazy> },

      // ── QR ──
      { path: 'table-qr',            element: <Lazy><ProtectedRoute adminOnly><TableQRView /></ProtectedRoute></Lazy> },
    ],
  },
  { path: '/check-in',            element: <Lazy><CheckInView /></Lazy> },
  { path: '/fingerprint-checkin', element: <Lazy><FingerprintCheckInView /></Lazy> },

  // ── Secure QR ordering (legacy single-session) — token-based ──
  { path: '/order/qr/:token',     element: <Lazy><SecureQROrderingView /></Lazy> },

  // ── Group ordering — stable table token, multi-device, no table ID in URL ──
  { path: '/order/t/:qrToken',    element: <Lazy><GroupOrderingView /></Lazy> },

  // ── Pickup ordering — public, token-gated customer page ──
  { path: '/pickup/:token',       element: <Lazy><PickupOrderingView /></Lazy> },

  // ── Legacy QR routes — kept for backward compatibility ──
  { path: '/table/:tableId',      element: <Lazy><QROrderingView /></Lazy> },
  { path: '/order/table-:tableNumber', element: <Lazy><TableRedirectView /></Lazy> },
  { path: '/order/:tableSlug',    element: <Lazy><TableRedirectView /></Lazy> },

  { path: '/customer-monitor',    element: <Lazy><CustomerMonitorView /></Lazy> },
]);
