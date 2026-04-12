<div>
                <label className="block text-sm font-medium mb-2">Full Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="John Doe"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Role *</label>
                <select
                  value={formData.role}
                  onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}
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
                  onChange={e => setFormData({ ...formData, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                  maxLength={4}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-lg tracking-widest text-center"
                  placeholder="••••"
                />
                <p className="text-xs text-gray-500 mt-1">This will be used for login</p>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button onClick={handleCancel} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleAddStaff} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Add Staff Member
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}