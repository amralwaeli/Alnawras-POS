import { createHashRouter, Navigate } from 'react-router';
import { Layout } from './components/Layout';
import { DashboardView } from './views/DashboardView';
import { TablesView } from './views/TablesView';
import { KitchenView } from './views/KitchenView';
import { InventoryView } from './views/InventoryView';
import { ReportsView } from './views/ReportsView';
import { AccountingView } from './views/AccountingView';
import { StaffView } from './views/StaffView';
import { AttendanceView } from './views/AttendanceView';
import { TableQRView } from './views/TableQRView';
import { CheckInView } from './views/CheckInView';
import { CustomerMenuView } from './views/CustomerMenuView';
import { TableManagementView } from './views/TableManagementView';
import { ProductManagementView } from './views/ProductManagementView';
import { CategoryManagementView } from './views/CategoryManagementView';

export const router = createHashRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', Component: DashboardView },
      { path: 'tables', Component: TablesView },
      { path: 'table-management', Component: TableManagementView },
      { path: 'product-management', Component: ProductManagementView },
      { path: 'category-management', Component: CategoryManagementView },
      { path: 'kitchen', Component: KitchenView },
      { path: 'inventory', Component: InventoryView },
      { path: 'reports', Component: ReportsView },
      { path: 'accounting', Component: AccountingView },
      { path: 'staff', Component: StaffView },
      { path: 'attendance', Component: AttendanceView },
      { path: 'table-qr', Component: TableQRView },
    ],
  },
  {
    path: '/check-in',
    Component: CheckInView,
  },
  {
    path: '/table/:tableId',
    Component: CustomerMenuView,
  },
]);
