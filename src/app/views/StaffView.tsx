import { useState } from 'react';
import { usePOS } from '../context/POSContext';
import { Users, UserCheck, Plus, X } from 'lucide-react';
import { AuthController } from '../controllers/AuthController';
import { User, UserRole } from '../models/types';

export function StaffView() {
  const { users, currentUser, setUsers } = usePOS();
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    role: 'cashier' as UserRole,
    pin: '',
  });
  const [error, setError] = useState('');

  // Auto-generate next employment number
  const generateEmploymentNumber = () => {
    const existingNumbers = users
      .map(u => u.employmentNumber)
      .filter(num => num.startsWith('EMP'))
      .map(num => parseInt(num.replace('EMP', '')))
      .filter(num => !isNaN(num));

    const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
    const nextNumber = maxNumber + 1;
    return `EMP${String(nextNumber).padStart(3, '0')}`;
  };

  if (!currentUser) return null;

  const activeUsers = users.filter(u => u.status === 'active');

  const handleAddStaff = () => {
    if (!currentUser || currentUser.role !== 'admin') {
      setError('Only admins can add staff');
      return;
    }

    // Validation
    if (!formData.name || !formData.pin) {
      setError('Name and PIN are required');
      return;
    }

    if (formData.pin.length !== 4 || !/^\d{4}$/.test(formData.pin)) {
      setError('PIN must be exactly 4 digits');
      return;
    }

    const employmentNumber = generateEmploymentNumber();
    const email = `${formData.name.toLowerCase().replace(/\s+/g, '.')}@storehub.com`;

    const newUser: Omit<User, 'id' | 'createdAt'> = {
      name: formData.name,
      employmentNumber,
      role: formData.role,
      pin: formData.pin,
      email,
      status: 'active',
      branchId: currentUser.branchId,
    };

    const result = AuthController.createUser(users, newUser, currentUser);

    if (result.success && result.user) {
      setUsers([...users, result.user]);
      setShowAddModal(false);
      setFormData({
        name: '',
        role: 'cashier',
        pin: '',
      });
      setError('');
    } else {
      setError(result.error || 'Failed to create user');
    }
  };

  const handleCancel = () => {
    setShowAddModal(false);
    setFormData({
      name: '',
      role: 'cashier',
      pin: '',
    });
    setError('');
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-2xl">Staff Management</h1>
            <p className="text-gray-600">Manage team members and roles</p>
          </div>
          {currentUser.role === 'admin' && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="size-4" />
              Add Staff
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="size-10 flex items-center justify-center bg-blue-100 rounded-lg">
                <Users className="size-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Staff</p>
                <p className="text-2xl font-semibold">{users.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="size-10 flex items-center justify-center bg-green-100 rounded-lg">
                <UserCheck className="size-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Active</p>
                <p className="text-2xl font-semibold">{activeUsers.length}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b">
            <h2 className="font-semibold">Staff Members</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Name</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Employment #</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Role</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Email</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="size-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-medium">
                          {user.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <span className="font-medium">{user.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm">{user.employmentNumber}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-1 text-xs rounded-full capitalize ${
                        user.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                        user.role === 'cashier' ? 'bg-blue-100 text-blue-700' :
                        user.role === 'waiter' ? 'bg-green-100 text-green-700' :
                        user.role === 'kitchen' ? 'bg-orange-100 text-orange-700' :
                        'bg-pink-100 text-pink-700'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{user.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          user.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          {user.status}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Staff Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Add New Staff Member</h3>
              <button
                onClick={handleCancel}
                className="size-8 flex items-center justify-center hover:bg-gray-100 rounded"
              >
                <X className="size-5" />
              </button>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Employment Number:</strong> {generateEmploymentNumber()} (auto-generated)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Full Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="John Doe"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Role *</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="cashier">Cashier</option>
                  <option value="waiter">Waiter</option>
                  <option value="kitchen">Kitchen</option>
                  <option value="hr">HR</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">4-Digit PIN *</label>
                <input
                  type="text"
                  value={formData.pin}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setFormData({ ...formData, pin: value });
                  }}
                  maxLength={4}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-lg tracking-widest text-center"
                  placeholder="••••"
                />
                <p className="text-xs text-gray-500 mt-1">This will be used for login</p>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={handleCancel}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddStaff}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Add Staff Member
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
