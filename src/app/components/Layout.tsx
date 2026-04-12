import { NavLink, Outlet, useNavigate } from 'react-router';
import { ShoppingCart, Package, BarChart3, Users, LogOut, Clock, DollarSign, ChefHat, LayoutDashboard, QrCode } from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { ROLE_PERMISSIONS } from '../models/types';

export function Layout() {
  const { currentUser, logout } = usePOS();
  const navigate = useNavigate();

  if (!currentUser) {
    return null;
  }

  const permissions = ROLE_PERMISSIONS[currentUser.role];

  // Define navigation items based on permissions
  const allNavItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'canViewReports' as const },
    { path: '/tables', label: 'Tables', icon: ShoppingCart, permission: 'canViewTables' as const },
    { path: '/kitchen', label: 'Kitchen', icon: ChefHat, permission: 'canManageInventory' as const },
    { path: '/inventory', label: 'Inventory', icon: Package, permission: 'canManageInventory' as const },
    { path: '/reports', label: 'Reports', icon: BarChart3, permission: 'canViewReports' as const },
    { path: '/accounting', label: 'Accounting', icon: DollarSign, permission: 'canManageAccounting' as const },
    { path: '/staff', label: 'Staff', icon: Users, permission: 'canManageStaff' as const },
    { path: '/attendance', label: 'Attendance', icon: Clock, permission: 'canViewAttendance' as const },
    { path: '/table-qr', label: 'Table QR Codes', icon: QrCode, permission: 'canViewReports' as const },
  ];

  const navItems = allNavItems.filter(item => permissions[item.permission]);

  const handleLogout = () => {
    logout();
    // No need to navigate - App component will show LoginView when currentUser is null
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-xl">StoreHub POS</h1>
          <p className="text-sm text-gray-600">Point of Sale System</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-medium">{currentUser.name}</p>
            <p className="text-sm text-gray-600 capitalize">{currentUser.role}</p>
          </div>
          <div className="size-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-medium">
            {currentUser.name.split(' ').map(n => n[0]).join('')}
          </div>
          <button
            onClick={handleLogout}
            className="ml-2 p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Logout"
          >
            <LogOut className="size-5 text-gray-600" />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <nav className="w-64 bg-white border-r flex flex-col">
          <div className="flex-1 p-4 space-y-1">
            {navItems.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`
                }
              >
                <item.icon className="size-5" />
                <span className="font-medium">{item.label}</span>
              </NavLink>
            ))}
          </div>

          <div className="p-4 border-t text-xs text-gray-500">
            <p>MVC Architecture</p>
            <p>Model · View · Controller</p>
          </div>
        </nav>

        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
