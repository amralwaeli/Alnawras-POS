import { NavLink, Outlet } from 'react-router';
import { Users, Clock, DollarSign, CalendarOff, Fingerprint } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { ROLE_PERMISSIONS } from '../../models/types';

const subNav = [
  { path: '/workforce/employees',  label: 'Employees',  icon: Users,       permission: 'canManageStaff' as const,    allowedRoles: ['manager', 'supervisor'] },
  { path: '/workforce/attendance', label: 'Attendance', icon: Clock,       permission: 'canViewAttendance' as const, allowedRoles: ['manager', 'supervisor'] },
  { path: '/workforce/payroll',    label: 'Payroll',    icon: DollarSign,  permission: 'canManagePayroll' as const,  allowedRoles: [] as string[] },
  { path: '/workforce/leave',      label: 'Leave',      icon: CalendarOff, permission: 'canManageLeave' as const,    allowedRoles: ['manager'] },
  { path: '/workforce/biometrics', label: 'Biometrics', icon: Fingerprint, permission: 'canManageStaff' as const,    allowedRoles: [] as string[] },
];

export function WorkforceLayout() {
  const { currentUser } = usePOS();
  if (!currentUser) return null;

  const perms = ROLE_PERMISSIONS[currentUser.role];

  const visibleNav = subNav.filter(item => {
    if (item.allowedRoles?.includes(currentUser.role)) return true;
    return !!perms[item.permission];
  });

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Sub-navigation bar */}
      <div className="bg-white border-b border-gray-200 shrink-0">
        <div className="px-6">
          <nav className="flex overflow-x-auto scrollbar-hide -mb-px">
            {visibleNav.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/workforce'}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    isActive
                      ? 'border-amber-500 text-amber-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`
                }
              >
                <item.icon className="size-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      {/* Page content */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <Outlet />
      </div>
    </div>
  );
}
