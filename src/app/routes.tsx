import { lazy, Suspense } from 'react';
import { createHashRouter, Navigate } from 'react-router';
import { Layout } from './components/Layout';

// Lazy load all views — only loaded when the user navigates to them
const DashboardView = lazy(() => import('./views/DashboardView').then(m => ({ default: m.DashboardView })));
const TablesView = lazy(() => import('./views/TablesView').then(m => ({ default: m.TablesView })));
const KitchenView = lazy(() => import('./views/KitchenView').then(m => ({ default: m.KitchenView })));
const InventoryView = lazy(() => import('./views/InventoryView').then(m => ({ default: m.InventoryView })));
const ReportsView = lazy(() => import('./views/ReportsView').then(m => ({ default: m.ReportsView })));
const AccountingView = lazy(() => import('./views/AccountingView').then(m => ({ default: m.AccountingView })));
const StaffView = lazy(() => import('./views/StaffView').then(m => ({ default: m.StaffView })));
const AttendanceView = lazy(() => import('./views/AttendanceView').then(m => ({ default: m.AttendanceView })));
const TableQRView = lazy(() => import('./views/TableQRView').then(m => ({ default: m.TableQRView })));
const CheckInView = lazy(() => import('./views/CheckInView').then(m => ({ default: m.CheckInView })));
const CustomerMenuView = lazy(() => import('./views/CustomerMenuView').then(m => ({ default: m.CustomerMenuView })));
const TableManagementView = lazy(() => import('./views/TableManagementView').then(m => ({ default: m.TableManagementView })));
const ProductManagementView = lazy(() => import('./views/ProductManagementView').then(m => ({ default: m.ProductManagementView })));
const CategoryManagementView = lazy(() => import('./views/CategoryManagementView').then(m => ({ default: m.CategoryManagementView })));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full min-h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Loading...</p>
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
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <Lazy><DashboardView /></Lazy> },
      { path: 'tables', element: <Lazy><TablesView /></Lazy> },
      { path: 'table-management', element: <Lazy><TableManagementView /></Lazy> },
      { path: 'product-management', element: <Lazy><ProductManagementView /></Lazy> },
      { path: 'category-management', element: <Lazy><CategoryManagementView /></Lazy> },
      { path: 'kitchen', element: <Lazy><KitchenView /></Lazy> },
      { path: 'inventory', element: <Lazy><InventoryView /></Lazy> },
      { path: 'reports', element: <Lazy><ReportsView /></Lazy> },
      { path: 'accounting', element: <Lazy><AccountingView /></Lazy> },
      { path: 'staff', element: <Lazy><StaffView /></Lazy> },
      { path: 'attendance', element: <Lazy><AttendanceView /></Lazy> },
      { path: 'table-qr', element: <Lazy><TableQRView /></Lazy> },
    ],
  },
  {
    path: '/check-in',
    element: <Lazy><CheckInView /></Lazy>,
  },
  {
    path: '/table/:tableId',
    element: <Lazy><CustomerMenuView /></Lazy>,
  },
]);
