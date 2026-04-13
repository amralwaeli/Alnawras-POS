{/* Category Dialog */}
      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCategory ? 'Edit Category' : 'Add New Category'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCategorySubmit} className="space-y-4">
            <div>
              <Label htmlFor="category-name">Category Name</Label>
              <Input
                id="category-name"
                value={categoryFormData.name}
                onChange={(e) => setCategoryFormData(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="category-description">Description (Optional)</Label>
              <Textarea
                id="category-description"
                value={categoryFormData.description}
                onChange={(e) => setCategoryFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="category-color">Color</Label>
                <Input
                  id="category-color"
                  type="color"
                  value={categoryFormData.color}
                  onChange={(e) => setCategoryFormData(prev => ({ ...prev, color: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="category-order">Display Order</Label>
                <Input
                  id="category-order"
                  type="number"
                  value={categoryFormData.displayOrder}
                  onChange={(e) => setCategoryFormData(prev => ({ ...prev, displayOrder: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="category-icon">Icon (Optional)</Label>
              <Input
                id="category-icon"
                value={categoryFormData.icon}
                onChange={(e) => setCategoryFormData(prev => ({ ...prev, icon: e.target.value }))}
                placeholder="e.g., 🍽, 🥗, 🍰"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingCategory ? 'Update' : 'Add'} Category
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}