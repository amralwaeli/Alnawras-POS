import { NavLink, Outlet, Navigate, useLocation } from 'react-router';
import { useState } from 'react';
import {
  ShoppingCart, Package, BarChart3, Users, LogOut, Clock,
  DollarSign, ChefHat, LayoutDashboard, QrCode, Tag, UtensilsCrossed,
  Settings, Fingerprint, ReceiptText, FileText, Printer, Star,
  ChevronsLeft, ChevronsRight, Menu, X, Building2, CalendarOff,
  ChevronDown, ChevronRight as ChevronRightIcon,
} from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { ROLE_PERMISSIONS } from '../models/types';

export function Layout() {
  const { currentUser, logout } = usePOS();
  const location = useLocation();
  const [collapsed, setCollapsed]     = useState(() => window.innerWidth < 1024);
  const [mobileOpen, setMobileOpen]   = useState(false);
  const [workforceOpen, setWorkforceOpen] = useState(
    () => location.pathname.startsWith('/workforce')
  );

  if (!currentUser) return <Navigate to="/check-in" replace />;

  const isPOSOnlyRole = ['kitchen', 'cashier', 'waiter'].includes(currentUser.role);
  if (isPOSOnlyRole) {
    return <div className="h-screen w-screen overflow-hidden"><Outlet /></div>;
  }

  const permissions = ROLE_PERMISSIONS[currentUser.role];

  type NavItem = {
    path: string; label: string; icon: any;
    permission: keyof typeof ROLE_PERMISSIONS['admin'];
    adminOnly?: boolean;
  };

  const allNavItems: NavItem[] = [
    // Admin gets the full analytics dashboard; ordering roles get the menu/ordering UI
    ...(currentUser.role === 'admin'
      ? [{ path: '/admin-dashboard', label: 'Dashboard',    icon: LayoutDashboard, permission: 'canViewReports' as const }]
      : [{ path: '/dashboard',       label: 'Dashboard',    icon: LayoutDashboard, permission: 'canViewOrderingDashboard' as const }]
    ),
    { path: '/tables',             label: 'Tables',         icon: ShoppingCart,  permission: 'canViewTables' as const },
    { path: '/kitchen',            label: 'Kitchen',        icon: ChefHat,       permission: 'canManageInventory' as const },
    { path: '/inventory',          label: 'Inventory',      icon: Package,       permission: 'canManageInventory' as const },
    { path: '/reports',            label: 'Reports',        icon: BarChart3,     permission: 'canViewReports' as const },
    { path: '/accounting',         label: 'Accounting',     icon: DollarSign,    permission: 'canManageAccounting' as const },
    { path: '/table-management',   label: 'Manage Tables',  icon: Settings,      permission: 'canManageInventory' as const, adminOnly: true },
    { path: '/product-management', label: 'Products',       icon: Package,       permission: 'canManageInventory' as const, adminOnly: true },
    { path: '/manage-menu',        label: 'Manage Menu',    icon: Tag,           permission: 'canManageInventory' as const, adminOnly: true },
    { path: '/bill-format',        label: 'Bill Format',    icon: ReceiptText,   permission: 'canManageAccounting' as const, adminOnly: true },
    { path: '/shifts',             label: 'Shifts',         icon: Clock,         permission: 'canManageAccounting' as const },
    { path: '/printers',           label: 'Printers',       icon: Printer,       permission: 'canManageInventory' as const, adminOnly: true },
    { path: '/loyalty',            label: 'Loyalty',        icon: Star,          permission: 'canViewReports' as const, adminOnly: true },
    { path: '/quotations',         label: 'Quotations',     icon: FileText,      permission: 'canManageInvoicesQuotations' as const },
    { path: '/invoices',           label: 'Invoices',       icon: FileText,      permission: 'canManageInvoicesQuotations' as const },
    { path: '/table-qr',           label: 'QR Codes',       icon: QrCode,        permission: 'canViewReports' as const, adminOnly: true },
  ];

  const navItems = allNavItems.filter(item => {
    if (item.adminOnly && currentUser.role !== 'admin') return false;
    return !!permissions[item.permission];
  });

  // Workforce sub-nav items
  const workforceSubItems = [
    { path: '/workforce/employees',  label: 'Employees',  icon: Users,       permission: 'canManageStaff' as const },
    { path: '/workforce/attendance', label: 'Attendance', icon: Clock,       permission: 'canViewAttendance' as const },
    { path: '/workforce/payroll',    label: 'Payroll',    icon: DollarSign,  permission: 'canManagePayroll' as const },
    { path: '/workforce/leave',      label: 'Leave',      icon: CalendarOff, permission: 'canManageLeave' as const },
    { path: '/workforce/biometrics', label: 'Biometrics', icon: Fingerprint, permission: 'canManageStaff' as const },
  ].filter(item => !!permissions[item.permission]);

  const showWorkforce = workforceSubItems.length > 0;

  const initials = currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase();
  const roleColors: Record<string, string> = {
    admin:      'from-violet-500 to-purple-600',
    cashier:    'from-blue-500 to-cyan-600',
    waiter:     'from-emerald-500 to-green-600',
    kitchen:    'from-orange-500 to-amber-600',
    hr:         'from-pink-500 to-rose-600',
    juice:      'from-yellow-500 to-amber-500',
    staff:      'from-teal-500 to-cyan-600',
    accounting: 'from-indigo-500 to-blue-600',
  };
  const avatarGradient = roleColors[currentUser.role] ?? 'from-gray-500 to-gray-600';

  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="h-screen flex bg-gray-50 overflow-hidden">

      {/* ── MOBILE BACKDROP ── */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-30 transition-opacity"
          onClick={closeMobile}
        />
      )}

      {/* ── SIDEBAR ──
          Mobile: fixed overlay, slides in from left
          Desktop: static, collapsible  */}
      <aside className={`
        flex flex-col bg-gray-900 text-white shrink-0
        fixed lg:static inset-y-0 left-0
        z-40 lg:z-auto
        ${collapsed ? 'lg:w-16' : 'lg:w-60'} w-64
        transition-all duration-200
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Brand */}
        <div className="flex items-center gap-3 px-3 py-4 border-b border-white/10">
          <div className="size-9 rounded-xl bg-amber-500 flex items-center justify-center shrink-0">
            <UtensilsCrossed className="size-5 text-white" />
          </div>
          <div className={`flex-1 min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
            <p className="font-bold text-base leading-tight truncate">Alnawras</p>
            <p className="text-[11px] text-gray-400 uppercase tracking-wider">Point of Sale</p>
          </div>
          {/* Desktop: collapse toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden lg:flex p-2 rounded-md text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          </button>
          {/* Mobile: close button */}
          <button
            onClick={closeMobile}
            className="lg:hidden p-2 rounded-md text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className={`flex-1 px-1 py-4 space-y-0.5 overflow-y-auto ${collapsed ? 'lg:text-center' : ''}`}>
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              title={item.label}
              onClick={closeMobile}
              className={({ isActive }) =>
                `flex items-center gap-3 ${collapsed ? 'lg:justify-center' : 'px-3'} py-2.5 rounded-lg text-sm transition-all ${
                  isActive
                    ? 'bg-amber-500 text-white font-medium'
                    : 'text-gray-400 hover:bg-white/8 hover:text-white'
                }`
              }
            >
              <item.icon className="size-4 shrink-0" />
              <span className={collapsed ? 'lg:hidden' : ''}>{item.label}</span>
            </NavLink>
          ))}

          {/* ── Workforce collapsible group ── */}
          {showWorkforce && (
            <div>
              <button
                onClick={() => {
                  setWorkforceOpen(o => !o);
                  if (collapsed) setCollapsed(false);
                }}
                title="Workforce"
                className={`w-full flex items-center gap-3 ${collapsed ? 'lg:justify-center' : 'px-3'} py-2.5 rounded-lg text-sm transition-all ${
                  location.pathname.startsWith('/workforce')
                    ? 'text-amber-400 bg-white/5'
                    : 'text-gray-400 hover:bg-white/8 hover:text-white'
                }`}
              >
                <Building2 className="size-4 shrink-0" />
                <span className={`flex-1 text-left ${collapsed ? 'lg:hidden' : ''}`}>Workforce</span>
                {!collapsed && (
                  workforceOpen
                    ? <ChevronDown className="size-3.5 shrink-0" />
                    : <ChevronRightIcon className="size-3.5 shrink-0" />
                )}
              </button>

              {workforceOpen && !collapsed && (
                <div className="ml-3 mt-0.5 border-l border-white/10 pl-3 space-y-0.5">
                  {workforceSubItems.map(item => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      title={item.label}
                      onClick={closeMobile}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-all ${
                          isActive
                            ? 'bg-amber-500 text-white font-medium'
                            : 'text-gray-400 hover:bg-white/8 hover:text-white'
                        }`
                      }
                    >
                      <item.icon className="size-3.5 shrink-0" />
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              )}

              {/* Collapsed: show sub-icons directly */}
              {workforceOpen && collapsed && (
                <div className="mt-0.5 space-y-0.5">
                  {workforceSubItems.map(item => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      title={item.label}
                      onClick={closeMobile}
                      className={({ isActive }) =>
                        `flex items-center justify-center py-2 rounded-lg text-sm transition-all ${
                          isActive
                            ? 'bg-amber-500 text-white'
                            : 'text-gray-400 hover:bg-white/8 hover:text-white'
                        }`
                      }
                    >
                      <item.icon className="size-4" />
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>

        {/* User section */}
        <div className="px-3 py-4 border-t border-white/10">
          <div className={`flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors ${collapsed ? 'lg:flex-col lg:px-0' : ''}`}>
            <div className={`size-8 rounded-full bg-gradient-to-br ${avatarGradient} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
              {initials}
            </div>
            <div className={`flex-1 min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
              <p className="text-sm font-medium text-white truncate">{currentUser.name}</p>
              <p className="text-xs text-gray-400 capitalize">{currentUser.role}</p>
            </div>
            <button
              onClick={logout}
              title="Logout"
              className="p-1.5 rounded-md text-gray-500 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── MAIN AREA ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <div className="lg:hidden sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <Menu className="size-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="size-6 rounded-lg bg-amber-500 flex items-center justify-center">
              <UtensilsCrossed className="size-3.5 text-white" />
            </div>
            <span className="font-bold text-sm text-gray-900">Alnawras POS</span>
          </div>
          <div className="flex-1" />
          <div className={`size-7 rounded-full bg-gradient-to-br ${avatarGradient} flex items-center justify-center text-white text-xs font-bold`}>
            {initials}
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
