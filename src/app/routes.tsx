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
const TableQRView            = lazy(() => import('./modules/tables').then(m => ({ default: m.TableQRView })));
const TableRedirectView      = lazy(() => import('./modules/tables').then(m => ({ default: m.TableRedirectView })));

const KitchenView            = lazy(() => import('./modules/kitchen').then(m => ({ default: m.KitchenView })));

const InventoryView          = lazy(() => import('./modules/inventory').then(m => ({ default: m.InventoryView })));

const StaffView              = lazy(() => import('./modules/staff').then(m => ({ default: m.StaffView })));
const CategoryManagementView = lazy(() => import('./modules/staff').then(m => ({ default: m.CategoryManagementView })));

const HRPanelView            = lazy(() => import('./modules/hr').then(m => ({ default: m.HRPanelView })));
const AttendanceView         = lazy(() => import('./modules/hr').then(m => ({ default: m.AttendanceView })));
const FingerprintCheckInView = lazy(() => import('./modules/hr').then(m => ({ default: m.FingerprintCheckInView })));

const ReportsView            = lazy(() => import('./modules/reports').then(m => ({ default: m.ReportsView })));

const AccountingView         = lazy(() => import('./modules/accounting').then(m => ({ default: m.AccountingView })));
const BillFormatView         = lazy(() => import('./modules/accounting').then(m => ({ default: m.BillFormatView })));

const CheckInView            = lazy(() => import('./modules/auth').then(m => ({ default: m.CheckInView })));
const CustomerMenuView       = lazy(() => import('./modules/menu').then(m => ({ default: m.CustomerMenuView })));

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
  if (currentUser.role === 'admin')   return <Navigate to="/admin-dashboard" replace />;
  if (currentUser.role === 'cashier') return <Navigate to="/tables" replace />;
  if (currentUser.role === 'waiter')  return <Navigate to="/dashboard" replace />;
  if (currentUser.role === 'kitchen') return <Navigate to="/kitchen" replace />;
  if (currentUser.role === 'hr')      return <Navigate to="/hr-panel" replace />;
  return <Navigate to="/admin-dashboard" replace />;
}

export const router = createHashRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, element: <Lazy><LandingPage /></Lazy> },

      // ── Dashboard ──
      { path: 'dashboard',           element: <Lazy><CustomerMenuView /></Lazy> },
      { path: 'admin-dashboard',     element: <Lazy><ProtectedRoute permission="canViewReports"><AdminDashboardView /></ProtectedRoute></Lazy> },

      // ── Tables ──
      { path: 'tables',              element: <Lazy><ProtectedRoute permission="canViewTables"><TablesView /></ProtectedRoute></Lazy> },
      { path: 'table-management',    element: <Lazy><ProtectedRoute adminOnly><TableManagementView /></ProtectedRoute></Lazy> },

      // ── Menu / Products ──
      { path: 'product-management',  element: <Lazy><ProtectedRoute adminOnly><ProductManagementView /></ProtectedRoute></Lazy> },
      { path: 'manage-menu',         element: <Lazy><ProtectedRoute adminOnly><CategoryManagementView /></ProtectedRoute></Lazy> },
      { path: 'category-management', element: <Navigate to="/manage-menu" replace /> },

      // ── Kitchen ──
      { path: 'kitchen',             element: <Lazy><ProtectedRoute permission="canManageInventory"><KitchenView /></ProtectedRoute></Lazy> },

      // ── Inventory ──
      { path: 'inventory',           element: <Lazy><ProtectedRoute permission="canManageInventory"><InventoryView /></ProtectedRoute></Lazy> },

      // ── Reports ──
      { path: 'reports',             element: <Lazy><ProtectedRoute permission="canViewReports"><ReportsView /></ProtectedRoute></Lazy> },

      // ── Accounting ──
      { path: 'accounting',          element: <Lazy><ProtectedRoute permission="canManageAccounting"><AccountingView /></ProtectedRoute></Lazy> },
      { path: 'bill-format',         element: <Lazy><ProtectedRoute permission="canManageAccounting"><BillFormatView /></ProtectedRoute></Lazy> },

      // ── Staff ──
      { path: 'staff',               element: <Lazy><ProtectedRoute permission="canManageStaff"><StaffView /></ProtectedRoute></Lazy> },
      { path: 'hr-panel',            element: <Lazy><ProtectedRoute permission="canManageStaff"><HRPanelView /></ProtectedRoute></Lazy> },
      { path: 'attendance',          element: <Lazy><ProtectedRoute permission="canViewAttendance"><AttendanceView /></ProtectedRoute></Lazy> },

      // ── QR ──
      { path: 'table-qr',            element: <Lazy><ProtectedRoute permission="canViewReports"><TableQRView /></ProtectedRoute></Lazy> },
    ],
  },
  { path: '/check-in',            element: <Lazy><CheckInView /></Lazy> },
  { path: '/fingerprint-checkin', element: <Lazy><FingerprintCheckInView /></Lazy> },
  { path: '/table/:tableId',      element: <Lazy><QROrderingView /></Lazy> },
  { path: '/order/table-:tableNumber', element: <Lazy><TableRedirectView /></Lazy> },
  { path: '/order/:tableSlug',    element: <Lazy><TableRedirectView /></Lazy> },
]);
