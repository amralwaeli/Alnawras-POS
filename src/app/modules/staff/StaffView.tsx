import { useState } from 'react';
import { usePOS } from '../../context/POSContext';
import { Users, UserCheck, Plus, X } from 'lucide-react';
import { UserRole } from '../../models/types';

const roleColors: Record<string, string> = {
  admin:   'bg-violet-100 text-violet-700',
  cashier: 'bg-blue-100 text-blue-700',
  waiter:  'bg-emerald-100 text-emerald-700',
  kitchen: 'bg-orange-100 text-orange-700',
  juice:   'bg-amber-100 text-amber-700',
  hr:      'bg-pink-100 text-pink-700',
};

const avatarColors: Record<string, string> = {
  admin:   'from-violet-500 to-purple-600',
  cashier: 'from-blue-500 to-cyan-600',
  waiter:  'from-emerald-500 to-green-600',
  kitchen: 'from-orange-500 to-amber-600',
  juice:   'from-yellow-400 to-amber-500',
  hr:      'from-pink-500 to-rose-600',
};

export function StaffView() {
  const { users, currentUser, addUser } = usePOS();
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ name: '', role: 'cashier' as UserRole, pin: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!currentUser) return null;

  const genEmpNum = () => {
    const nums = users.map(u => u.employmentNumber).filter(n => n.startsWith('EMP')).map(n => parseInt(n.replace('EMP', ''))).filter(n => !isNaN(n));
    return `EMP${String((nums.length > 0 ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
  };

  const handleAdd = async () => {
    if (!formData.name.trim() || !formData.pin) { setError('Name and PIN are required'); return; }
    if (!/^\d{4}$/.test(formData.pin)) { setError('PIN must be exactly 4 digits'); return; }
    setSubmitting(true); setError('');
    const result = await addUser({
      name: formData.name.trim(),
      employmentNumber: genEmpNum(),
      role: formData.role,
      pin: formData.pin,
      email: `${formData.name.toLowerCase().replace(/\s+/g, '.')}@alnawras.com`,
      status: 'active',
      branchId: currentUser.branchId,
    });
    if (result.success) { setShowModal(false); setFormData({ name: '', role: 'cashier', pin: '' }); }
    else setError(result.error || 'Failed to add staff member');
    setSubmitting(false);
  };

  const activeCount = users.filter(u => u.status === 'active').length;

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-6 space-y-6 max-w-5xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Staff</h1>
            <p className="text-gray-500 text-sm mt-0.5">Manage your team members and roles</p>
          </div>
          {currentUser.role === 'admin' && (
            <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors">
              <Plus className="size-4" /> Add Staff
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-blue-50 rounded-2xl p-5 border border-blue-100">
            <div className="inline-flex size-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600 mb-3"><Users className="size-5" /></div>
            <p className="text-sm text-gray-500">Total Staff</p>
            <p className="text-3xl font-bold text-blue-700">{users.length}</p>
          </div>
          <div className="bg-emerald-50 rounded-2xl p-5 border border-emerald-100">
            <div className="inline-flex size-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 mb-3"><UserCheck className="size-5" /></div>
            <p className="text-sm text-gray-500">Active</p>
            <p className="text-3xl font-bold text-emerald-700">{activeCount}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Team Members</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left">
                  {['Member', 'Employment #', 'Role', 'Email', 'Status'].map(h => (
                    <th key={h} className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`size-9 rounded-full bg-gradient-to-br ${avatarColors[u.role] ?? 'from-gray-400 to-gray-600'} flex items-center justify-center text-white text-xs font-bold`}>
                          {u.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <span className="font-medium text-sm text-gray-900">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-sm text-gray-500">{u.employmentNumber}</td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${roleColors[u.role] ?? 'bg-gray-100 text-gray-600'}`}>{u.role}</span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-500">{u.email}</td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${u.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                        {u.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-lg text-gray-900">Add Staff Member</h3>
              <button onClick={() => setShowModal(false)} className="size-8 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors">
                <X className="size-4" />
              </button>
            </div>

            {error && <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">{error}</div>}

            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-xl text-sm text-gray-600">
                Employment # <span className="font-mono font-semibold text-gray-900">{genEmpNum()}</span> will be auto-assigned
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name *</label>
                <input type="text" value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="e.g. Ahmad Al-Rashidi" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Role *</label>
                <select value={formData.role} onChange={e => setFormData(f => ({ ...f, role: e.target.value as UserRole }))}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white">
                  {['cashier', 'waiter', 'kitchen', 'juice', 'hr', 'admin'].map(r => (
                    <option key={r} value={r} className="capitalize">{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">4-Digit PIN *</label>
                <input type="text" inputMode="numeric" value={formData.pin}
                  onChange={e => setFormData(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm font-mono text-center tracking-[0.5em] text-xl focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="••••" maxLength={4} />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleAdd} disabled={submitting}
                className="flex-1 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {submitting ? 'Adding...' : 'Add Member'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
