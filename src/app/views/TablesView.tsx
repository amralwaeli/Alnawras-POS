{/* Add Table Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Add New Table</h3>
              <button onClick={() => setShowAddModal(false)} className="size-8 flex items-center justify-center hover:bg-gray-100 rounded"><X className="size-5" /></button>
            </div>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              Table number will be auto-assigned as <strong>Table {tables.length > 0 ? Math.max(...tables.map(t => t.number)) + 1 : 1}</strong>. A QR code will be automatically available in the Table QR page.
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Seating Capacity *</label>
              <input type="number" min="1" max="20" value={formData.capacity} onChange={e => setFormData({ capacity: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowAddModal(false)} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleAddTable} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Add Table</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Table Modal */}
      {showEditModal && selectedTable && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Edit Table {selectedTable.number}</h3>
              <button onClick={() => setShowEditModal(false)} className="size-8 flex items-center justify-center hover:bg-gray-100 rounded"><X className="size-5" /></button>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Seating Capacity *</label>
              <input type="number" min="1" max="20" value={editData.capacity} onChange={e => setEditData({ capacity: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowEditModal(false)} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleEditTable} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}