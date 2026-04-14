import { NavLink, Outlet, useNavigate, Navigate } from 'react-router';
import {
  ShoppingCart, Package, BarChart3, Users, LogOut, Clock,
  DollarSign, ChefHat, LayoutDashboard, QrCode, Tag, UtensilsCrossed, Settings
} from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { ROLE_PERMISSIONS } from '../models/types';

export function Layout() {
  const { currentUser, logout } = usePOS();

  if (!currentUser) return <Navigate to="/check-in" replace />;

  // Detect if user is a POS-only role (no sidebar)
  const isPOSOnlyRole = ['kitchen', 'cashier', 'waiter'].includes(currentUser.role);

  // If user is kitchen, cashier, or waiter, render fullscreen POS layout
  if (isPOSOnlyRole) {
    return (
      <div className="h-screen w-screen overflow-hidden">
        <Outlet />
      </div>
    );
  }

  // Otherwise, render sidebar layout for admin/manager
  const permissions = ROLE_PERMISSIONS[currentUser.role];

  const allNavItems = [
    { path: '/dashboard',          label: 'Dashboard',       icon: LayoutDashboard, permission: 'canViewReports' as const },
    { path: '/tables',             label: 'Tables',          icon: ShoppingCart,    permission: 'canViewTables' as const },
    { path: '/kitchen',            label: 'Kitchen',         icon: ChefHat,         permission: 'canManageInventory' as const },
    { path: '/inventory',          label: 'Inventory',       icon: Package,         permission: 'canManageInventory' as const },
    { path: '/reports',            label: 'Reports',         icon: BarChart3,       permission: 'canViewReports' as const },
    { path: '/accounting',         label: 'Accounting',      icon: DollarSign,      permission: 'canManageAccounting' as const },
    { path: '/staff',              label: 'Staff',           icon: Users,           permission: 'canManageStaff' as const },
    { path: '/attendance',         label: 'Attendance',      icon: Clock,           permission: 'canViewAttendance' as const },
    { path: '/table-management',   label: 'Manage Tables',   icon: Settings,        permission: 'canManageInventory' as const, adminOnly: true },
    { path: '/product-management', label: 'Products',        icon: Package,         permission: 'canManageInventory' as const, adminOnly: true },
    { path: '/category-management',label: 'Categories',      icon: Tag,             permission: 'canManageInventory' as const, adminOnly: true },
    { path: '/table-qr',           label: 'QR Codes',        icon: QrCode,          permission: 'canViewReports' as const },
  ];

  const navItems = allNavItems.filter(item => {
    if (item.adminOnly && currentUser.role !== 'admin') return false;
    return permissions[item.permission];
  });

  const initials = currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase();
  const roleColors: Record<string, string> = {
    admin:   'from-violet-500 to-purple-600',
    cashier: 'from-blue-500 to-cyan-600',
    waiter:  'from-emerald-500 to-green-600',
    kitchen: 'from-orange-500 to-amber-600',
    hr:      'from-pink-500 to-rose-600',
  };
  const avatarGradient = roleColors[currentUser.role] ?? 'from-gray-500 to-gray-600';

  return (
    <div className="h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className="w-60 flex flex-col bg-gray-900 text-white shrink-0">
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
          <div className="size-9 rounded-xl bg-amber-500 flex items-center justify-center">
            <UtensilsCrossed className="size-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-base leading-tight">Alnawras</p>
            <p className="text-[11px] text-gray-400 uppercase tracking-wider">Point of Sale</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  isActive
                    ? 'bg-amber-500 text-white font-medium'
                    : 'text-gray-400 hover:bg-white/8 hover:text-white'
                }`
              }
            >
              <item.icon className="size-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        <div className="px-3 py-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors">
            <div className={`size-8 rounded-full bg-gradient-to-br ${avatarGradient} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{currentUser.name}</p>
              <p className="text-xs text-gray-400 capitalize">{currentUser.role}</p>
            </div>
            <button
              onClick={logout}
              title="Logout"
              className="p-1.5 rounded-md text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
