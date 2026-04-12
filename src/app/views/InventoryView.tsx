<div className="col-span-2 flex items-center gap-3">
                <input type="checkbox" id="isActive" checked={formData.isActive} onChange={e => setFormData({ ...formData, isActive: e.target.checked })} className="size-4 rounded" />
                <label htmlFor="isActive" className="text-sm font-medium">Active (visible on menu)</label>
              </div>
            </div>

            {formData.image && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <img src={formData.image} alt="preview" className="size-16 object-cover rounded" onError={e => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100&h=100&fit=crop'; }} />
                <span className="text-sm text-gray-500">Image preview</span>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={handleClose} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleSubmit} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                {modalMode === 'add' ? 'Add Product' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}