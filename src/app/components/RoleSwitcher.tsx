import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { usePOS } from '../context/POSContext';
import { stationRefusal } from '../context/AuthContext';
import { roleLabel, type UserRole } from '../models/types';

/**
 * For staff who do several jobs (main role + extra roles): pick which job's screens to use
 * right now. Permissions stay combined across all their roles; this only changes the
 * screens and menus, which follow the role. Hidden for people with one role.
 */
export function RoleSwitcher({ className = '' }: { className?: string }) {
  const { currentUser, setCurrentUser } = usePOS();
  const navigate = useNavigate();
  const roles = currentUser?.allRoles ?? [];
  if (!currentUser || roles.length < 2) return null;

  const choose = (role: UserRole) => {
    // Same device rule as signing in (e.g. a waiter tablet only takes waiter roles).
    const refused = stationRefusal({ ...currentUser, role, extraRoles: [], allRoles: [role] });
    if (refused) { toast.error(refused); return; }
    setCurrentUser({ ...currentUser, role });
    navigate('/');   // that role's start screen
  };

  return (
    <select value={currentUser.role} onChange={e => choose(e.target.value as UserRole)} aria-label="Switch role"
      className={`min-h-11 px-2 rounded-lg text-sm font-semibold cursor-pointer ${className}`}>
      {roles.map(r => <option key={r} value={r} className="text-gray-900">{roleLabel(r)}</option>)}
    </select>
  );
}
