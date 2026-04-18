import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Edit, Trash2, Tag, Palette, Save, GripVertical, Search } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../../components/ui/alert-dialog';
import { Card, CardContent } from '../../components/ui/card';
import { Checkbox } from '../../components/ui/checkbox';
import { toast } from 'sonner';

export function CategoryManagementView() {
  const { categories, products, addCategory, updateCategory, deleteCategory, updateProduct } = usePOS();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [categoryProducts, setCategoryProducts] = useState<Set<string>>(new Set());
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#F97316',
    icon: '',
    displayOrder: '0',
  });

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.displayOrder - b.displayOrder),
    [categories]
  );

  const filteredProducts = useMemo(
    () => products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase())),
    [products, productSearch]
  );

  const allFilteredSelected = filteredProducts.length > 0 && filteredProducts.every(p => categoryProducts.has(p.id));
  const someFilteredSelected = filteredProducts.some(p => categoryProducts.has(p.id));

  const handleSelectAll = () => {
    const currentlyAllSelected = filteredProducts.every(p => categoryProducts.has(p.id));
    setCategoryProducts(prev => {
      const next = new Set(prev);
      if (currentlyAllSelected) {
        filteredProducts.forEach(p => next.delete(p.id));
      } else {
        filteredProducts.forEach(p => next.add(p.id));
      }
      return next;
    });
  };

  useEffect(() => {
    if (!sortedCategories.length) {
      setSelectedCategory('');
      return;
    }

    if (!selectedCategory || !sortedCategories.some(category => category.id === selectedCategory)) {
      setSelectedCategory(sortedCategories[0].id);
    }
  }, [selectedCategory, sortedCategories]);

  useEffect(() => {
    if (!selectedCategory) {
      setCategoryProducts(new Set());
      return;
    }

    const selectedCategoryObj = categories.find(category => category.id === selectedCategory);
    const assignedProducts = products
      .filter(product =>
        product.categoryId === selectedCategory ||
        (!!selectedCategoryObj && product.category?.toLowerCase() === selectedCategoryObj.name.toLowerCase())
      )
      .map(product => product.id);

    setCategoryProducts(new Set(assignedProducts));
  }, [categories, products, selectedCategory]);

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      color: '#F97316',
      icon: '',
      displayOrder: String(sortedCategories.length),
    });
    setEditingCategory(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const categoryData = {
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      color: formData.color,
      icon: formData.icon.trim() || undefined,
      displayOrder: Number.parseInt(formData.displayOrder, 10) || 0,
      isActive: true,
    };

    try {
      const result = editingCategory
        ? await updateCategory(editingCategory.id, categoryData)
        : await addCategory(categoryData);

      if (!result.success) {
        toast.error(result.error || `Failed to ${editingCategory ? 'update' : 'add'} category`);
        return;
      }

      toast.success(`Category ${editingCategory ? 'updated' : 'added'} successfully`);
      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      toast.error('An error occurred');
    }
  };

  const handleEdit = (category: any) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || '',
      color: category.color || '#F97316',
      icon: category.icon || '',
      displayOrder: String(category.displayOrder),
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (categoryId: string) => {
    try {
      const result = await deleteCategory(categoryId);
      if (result.success) {
        toast.success('Category deleted successfully');
      } else {
        toast.error(result.error || 'Failed to delete category');
      }
    } catch (error) {
      toast.error('An error occurred');
    }
  };

  const handleProductToggle = (productId: string, checked: boolean) => {
    setCategoryProducts(prev => {
      const next = new Set(prev);
      if (checked) next.add(productId);
      else next.delete(productId);
      return next;
    });
  };

  const handleSaveAssignments = async () => {
    if (!selectedCategory) return;

    try {
      const selectedCategoryObj = categories.find(category => category.id === selectedCategory);
      if (!selectedCategoryObj) return;

      const assignedProducts = products.filter(product =>
        product.categoryId === selectedCategory ||
        product.category?.toLowerCase() === selectedCategoryObj.name.toLowerCase()
      );

      const productsToUpdate = products.filter(product => categoryProducts.has(product.id));
      const productsToRemove = assignedProducts.filter(product => !categoryProducts.has(product.id));

      for (const product of productsToUpdate) {
        if (product.categoryId !== selectedCategory || product.category !== selectedCategoryObj.name) {
          await updateProduct(product.id, {
            categoryId: selectedCategory,
            category: selectedCategoryObj.name,
          });
        }
      }

      for (const product of productsToRemove) {
        await updateProduct(product.id, {
          categoryId: undefined,
          category: 'Uncategorized',
        });
      }

      toast.success('Menu assignments saved successfully');
    } catch (error) {
      toast.error('Failed to save assignments');
    }
  };

  const persistCategoryOrder = async (orderedIds: string[]) => {
    setIsSavingOrder(true);

    try {
      await Promise.all(
        orderedIds.map((categoryId, index) =>
          updateCategory(categoryId, { displayOrder: index })
        )
      );
      toast.success('Menu order updated');
    } catch (error) {
      toast.error('Failed to update menu order');
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleDrop = async (targetCategoryId: string) => {
    if (!draggedCategoryId || draggedCategoryId === targetCategoryId) {
      setDraggedCategoryId(null);
      return;
    }

    const nextOrder = [...sortedCategories];
    const draggedIndex = nextOrder.findIndex(category => category.id === draggedCategoryId);
    const targetIndex = nextOrder.findIndex(category => category.id === targetCategoryId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedCategoryId(null);
      return;
    }

    const [draggedCategory] = nextOrder.splice(draggedIndex, 1);
    nextOrder.splice(targetIndex, 0, draggedCategory);

    setDraggedCategoryId(null);
    await persistCategoryOrder(nextOrder.map(category => category.id));
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manage Menu</h1>
          <p className="text-gray-600">Reorder waiter tabs by drag and drop and control which products appear in each tab.</p>
        </div>
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="size-4 mr-2" />
              Add Category
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingCategory ? 'Edit Category' : 'Add New Category'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="category-name">Category Name</Label>
                <Input
                  id="category-name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="category-description">Description</Label>
                <Textarea
                  id="category-description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="category-color">Color</Label>
                  <Input
                    id="category-color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="category-order">Display Order</Label>
                  <Input
                    id="category-order"
                    type="number"
                    value={formData.displayOrder}
                    onChange={(e) => setFormData(prev => ({ ...prev, displayOrder: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="category-icon">Icon</Label>
                <Input
                  id="category-icon"
                  value={formData.icon}
                  onChange={(e) => setFormData(prev => ({ ...prev, icon: e.target.value }))}
                  placeholder="Optional icon or emoji"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">{editingCategory ? 'Update' : 'Add'} Category</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Waiter Tabs</h2>
                <p className="text-sm text-gray-500">Drag categories to change the order on the waiter page.</p>
              </div>
              {isSavingOrder && <span className="text-xs font-semibold text-orange-500">Saving...</span>}
            </div>

            <div className="space-y-3">
              {sortedCategories.map((category, index) => (
                <Card
                  key={category.id}
                  draggable
                  onDragStart={() => setDraggedCategoryId(category.id)}
                  onDragEnd={() => setDraggedCategoryId(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => void handleDrop(category.id)}
                  onClick={() => { setSelectedCategory(category.id); setProductSearch(''); }}
                  className={`cursor-pointer border transition-all ${
                    selectedCategory === category.id ? 'border-orange-300 ring-2 ring-orange-200' : 'border-gray-200'
                  } ${draggedCategoryId === category.id ? 'opacity-60' : ''}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          className="rounded-xl border border-gray-200 bg-gray-50 p-2 text-gray-400 cursor-grab active:cursor-grabbing"
                          aria-label={`Drag ${category.name}`}
                        >
                          <GripVertical className="size-4" />
                        </button>
                        <div
                          className="size-3 rounded-full shrink-0"
                          style={{ backgroundColor: category.color || '#F97316' }}
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{index + 1}. {category.name}</p>
                          <p className="text-xs text-gray-500 truncate">
                            {category.description || 'No description'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(category);
                          }}
                        >
                          <Edit className="size-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Category</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{category.name}"? This will remove that tab from the waiter page.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(category.id)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {sortedCategories.length === 0 && (
              <div className="py-10 text-center text-gray-500">
                <Tag className="size-8 mx-auto mb-3 text-gray-300" />
                <p>No categories created yet.</p>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Tab Products</h2>
              <p className="text-sm text-gray-500">
                {selectedCategory
                  ? 'Choose which products appear under the selected waiter tab.'
                  : 'Select a category from the left to manage its products.'}
              </p>
            </div>
            {selectedCategory && (
              <Button onClick={handleSaveAssignments}>
                <Save className="size-4 mr-2" />
                Save Assignments
              </Button>
            )}
          </div>

          {selectedCategory ? (
            <>
              {/* Search + Select All toolbar */}
              <div className="flex items-center gap-3 mb-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="shrink-0 px-4 py-2 text-sm font-semibold rounded-xl border border-gray-200 hover:border-orange-300 hover:bg-orange-50 transition-colors whitespace-nowrap"
                >
                  {allFilteredSelected
                    ? 'Unselect All'
                    : someFilteredSelected
                      ? 'Select Remaining'
                      : 'Select All'}
                </button>
              </div>

              <p className="text-xs text-gray-400 mb-3">
                {categoryProducts.size} selected · {filteredProducts.length} shown{productSearch ? ` for "${productSearch}"` : ''}
              </p>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {filteredProducts.map(product => (
                  <label
                    key={product.id}
                    htmlFor={product.id}
                    className="flex items-center gap-3 rounded-2xl border border-gray-200 p-4 cursor-pointer hover:border-orange-200 hover:bg-orange-50/40 transition-colors"
                  >
                    <Checkbox
                      id={product.id}
                      checked={categoryProducts.has(product.id)}
                      onCheckedChange={(checked) => handleProductToggle(product.id, checked as boolean)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 truncate">{product.name}</p>
                      <p className="text-sm text-gray-500 truncate">
                        RM {product.price.toFixed(2)} | Current: {product.category || 'Uncategorized'}
                      </p>
                    </div>
                  </label>
                ))}

                {filteredProducts.length === 0 && productSearch && (
                  <div className="col-span-full py-10 text-center text-gray-500">
                    <Search className="size-8 mx-auto mb-3 text-gray-300" />
                    <p>No products match "{productSearch}"</p>
                  </div>
                )}

                {products.length === 0 && (
                  <div className="col-span-full py-10 text-center text-gray-500">
                    <p>No products available.</p>
                    <p className="text-sm text-gray-400">Add products first in Product Management.</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="py-16 text-center text-gray-500">
              <Palette className="size-10 mx-auto mb-3 text-gray-300" />
              <p>Select a category to manage its products.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}