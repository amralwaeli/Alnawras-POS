import { lazy, Suspense } from 'react';
import { createHashRouter, Navigate } from 'react-router';
import { Layout } from './components/Layout';
import { usePOS } from './context/POSContext';
import { ROLE_PERMISSIONS } from './models/types';

function ProtectedRoute({ children, permission, adminOnly }: {
  children: React.ReactNode;
  permission?: keyof typeof ROLE_PERMISSIONS['admin'];
  adminOnly?: boolean;
}) {
  const { currentUser } = usePOS();

  // If no user, send back to login (Check-in)
  if (!currentUser) return <Navigate to="/check-in" replace />;

  // If admin permission required and user is not admin
  if (adminOnly && currentUser.role !== 'admin') return <Navigate to="/" replace />;

  // If specific permission required and user doesn't have it
  if (permission && !ROLE_PERMISSIONS[currentUser.role]?.[permission]) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

// Lazy load views
const DashboardView           = lazy(() => import('./views/DashboardView').then(m => ({ default: m.DashboardView })));
const TablesView              = lazy(() => import('./views/TablesView').then(m => ({ default: m.TablesView })));
const KitchenView             = lazy(() => import('./views/KitchenView').then(m => ({ default: m.KitchenView })));
const InventoryView           = lazy(() => import('./views/InventoryView').then(m => ({ default: m.InventoryView })));
const ReportsView             = lazy(() => import('./views/ReportsView').then(m => ({ default: m.ReportsView })));
const AccountingView          = lazy(() => import('./views/AccountingView').then(m => ({ default: m.AccountingView })));
const StaffView               = lazy(() => import('./views/StaffView').then(m => ({ default: m.StaffView })));
const AttendanceView          = lazy(() => import('./views/AttendanceView').then(m => ({ default: m.AttendanceView })));
const TableQRView             = lazy(() => import('./views/TableQRView').then(m => ({ default: m.TableQRView })));
const CheckInView             = lazy(() => import('./views/CheckInView').then(m => ({ default: m.CheckInView })));
const CustomerMenuView        = lazy(() => import('./views/CustomerMenuView').then(m => ({ default: m.CustomerMenuView })));
const TableManagementView     = lazy(() => import('./views/TableManagementView').then(m => ({ default: m.TableManagementView })));
const ProductManagementView   = lazy(() => import('./views/ProductManagementView').then(m => ({ default: m.ProductManagementView })));
const CategoryManagementView  = lazy(() => import('./views/CategoryManagementView').then(m => ({ default: m.CategoryManagementView })));
const HRPanelView             = lazy(() => import('./views/HRPanelView').then(m => ({ default: m.HRPanelView })));
const FingerprintCheckInView  = lazy(() => import('./views/FingerprintCheckInView').then(m => ({ default: m.FingerprintCheckInView })));

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

export const router = createHashRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      // ─── THE DEFAULT LANDING PAGE ───
      { index: true, element: <Lazy><CustomerMenuView /></Lazy> },
      { path: 'dashboard',           element: <Lazy><CustomerMenuView /></Lazy> },

      // ─── OTHER ROUTES ───
      { path: 'admin-dashboard',     element: <Lazy><ProtectedRoute permission="canViewReports"><DashboardView /></ProtectedRoute></Lazy> },
      { path: 'tables',              element: <Lazy><ProtectedRoute permission="canViewTables"><TablesView /></ProtectedRoute></Lazy> },
      { path: 'table-management',    element: <Lazy><ProtectedRoute adminOnly><TableManagementView /></ProtectedRoute></Lazy> },
      { path: 'product-management',  element: <Lazy><ProtectedRoute adminOnly><ProductManagementView /></ProtectedRoute></Lazy> },
      { path: 'category-management', element: <Lazy><ProtectedRoute adminOnly><CategoryManagementView /></ProtectedRoute></Lazy> },
      { path: 'kitchen',             element: <Lazy><ProtectedRoute permission="canManageInventory"><KitchenView /></ProtectedRoute></Lazy> },
      { path: 'inventory',           element: <Lazy><ProtectedRoute permission="canManageInventory"><InventoryView /></ProtectedRoute></Lazy> },
      { path: 'reports',             element: <Lazy><ProtectedRoute permission="canViewReports"><ReportsView /></ProtectedRoute></Lazy> },
      { path: 'accounting',          element: <Lazy><ProtectedRoute permission="canManageAccounting"><AccountingView /></ProtectedRoute></Lazy> },
      { path: 'staff',               element: <Lazy><ProtectedRoute permission="canManageStaff"><StaffView /></ProtectedRoute></Lazy> },
      { path: 'hr-panel',            element: <Lazy><ProtectedRoute permission="canManageStaff"><HRPanelView /></ProtectedRoute></Lazy> },
      { path: 'attendance',          element: <Lazy><ProtectedRoute permission="canViewAttendance"><AttendanceView /></ProtectedRoute></Lazy> },
      { path: 'table-qr',            element: <Lazy><ProtectedRoute permission="canViewReports"><TableQRView /></ProtectedRoute></Lazy> },
    ],
  },
  {
    path: '/check-in',
    element: <Lazy><CheckInView /></Lazy>,
  },
  {
    path: '/fingerprint-checkin',
    element: <Lazy><FingerprintCheckInView /></Lazy>,
  },
  {
    path: '/table/:tableId',
    element: <Lazy><CustomerMenuView /></Lazy>,
  },
]);
