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
                <p className="text-xs text-gray-500 mt-1">Used for login</p>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={handleClose} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleSubmit} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                {modalMode === 'add' ? 'Add Staff Member' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}