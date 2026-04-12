import React, { useState } from 'react';
import { Plus, Edit, Trash2, Tag, Palette, ArrowUp, ArrowDown, Save } from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Checkbox } from '../components/ui/checkbox';
import { toast } from 'sonner';

export function CategoryManagementView() {
  const { categories, products, addCategory, updateCategory, deleteCategory, updateProduct } = usePOS();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [categoryProducts, setCategoryProducts] = useState<Set<string>>(new Set());

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#3B82F6',
    icon: '',
    displayOrder: '0',
  });

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      color: '#3B82F6',
      icon: '',
      displayOrder: '0',
    });
    setEditingCategory(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const categoryData = {
      name: formData.name,
      description: formData.description || undefined,
      color: formData.color,
      icon: formData.icon || undefined,
      displayOrder: parseInt(formData.displayOrder),
      isActive: true,
      branchId: 'branch-1', // TODO: Get from current user
    };

    try {
      if (editingCategory) {
        const result = await updateCategory(editingCategory.id, categoryData);
        if (result.success) {
          toast.success('Category updated successfully');
          setIsDialogOpen(false);
          resetForm();
        } else {
          toast.error(result.error || 'Failed to update category');
        }
      } else {
        const result = await addCategory(categoryData);
        if (result.success) {
          toast.success('Category added successfully');
          setIsDialogOpen(false);
          resetForm();
        } else {
          toast.error(result.error || 'Failed to add category');
        }
      }
    } catch (error) {
      toast.error('An error occurred');
    }
  };

  const handleEdit = (category: any) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || '',
      color: category.color,
      icon: category.icon || '',
      displayOrder: category.displayOrder.toString(),
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

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId);
    const category = categories.find(c => c.id === categoryId);
    if (category) {
      const productIds = products
        .filter(p => p.categoryId === categoryId)
        .map(p => p.id);
      setCategoryProducts(new Set(productIds));
    }
  };

  const handleProductToggle = (productId: string, checked: boolean) => {
    const newProducts = new Set(categoryProducts);
    if (checked) {
      newProducts.add(productId);
    } else {
      newProducts.delete(productId);
    }
    setCategoryProducts(newProducts);
  };

  const handleSaveAssignments = async () => {
    if (!selectedCategory) return;

    try {
      const selectedCategoryObj = categories.find(c => c.id === selectedCategory);
      if (!selectedCategoryObj) return;

      // Update all products that should be in this category
      const productsToUpdate = products.filter(p => categoryProducts.has(p.id));
      const productsToRemove = products.filter(p =>
        p.categoryId === selectedCategory && !categoryProducts.has(p.id)
      );

      // Add products to category
      for (const product of productsToUpdate) {
        if (product.categoryId !== selectedCategory) {
          await updateProduct(product.id, {
            categoryId: selectedCategory,
            category: selectedCategoryObj.name,
          });
        }
      }

      // Remove products from category
      for (const product of productsToRemove) {
        await updateProduct(product.id, {
          categoryId: undefined,
          category: 'Uncategorized',
        });
      }

      toast.success('Product assignments saved successfully');
    } catch (error) {
      toast.error('Failed to save assignments');
    }
  };

  const moveCategory = async (categoryId: string, direction: 'up' | 'down') => {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return;

    const sortedCategories = [...categories].sort((a, b) => a.displayOrder - b.displayOrder);
    const currentIndex = sortedCategories.findIndex(c => c.id === categoryId);

    if (direction === 'up' && currentIndex > 0) {
      const prevCategory = sortedCategories[currentIndex - 1];
      await updateCategory(categoryId, { displayOrder: prevCategory.displayOrder });
      await updateCategory(prevCategory.id, { displayOrder: category.displayOrder });
    } else if (direction === 'down' && currentIndex < sortedCategories.length - 1) {
      const nextCategory = sortedCategories[currentIndex + 1];
      await updateCategory(categoryId, { displayOrder: nextCategory.displayOrder });
      await updateCategory(nextCategory.id, { displayOrder: category.displayOrder });
    }
  };

  const sortedCategories = [...categories].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Waiter Platform Design</h1>
          <p className="text-gray-600">Create categories and assign products for the waiters interface</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
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
                <Label htmlFor="category-description">Description (Optional)</Label>
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
                <Label htmlFor="category-icon">Icon (Optional)</Label>
                <Input
                  id="category-icon"
                  value={formData.icon}
                  onChange={(e) => setFormData(prev => ({ ...prev, icon: e.target.value }))}
                  placeholder="e.g., 🍽️, 🥗, 🍰"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Categories List */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Categories</h2>
          <div className="space-y-3">
            {sortedCategories.map((category, index) => (
              <Card
                key={category.id}
                className={`cursor-pointer transition-colors ${
                  selectedCategory === category.id ? 'ring-2 ring-blue-500' : ''
                }`}
                onClick={() => handleCategorySelect(category.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: category.color }}
                      />
                      {category.icon && <span className="text-lg">{category.icon}</span>}
                      <div>
                        <h3 className="font-medium">{category.name}</h3>
                        {category.description && (
                          <p className="text-sm text-gray-600">{category.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveCategory(category.id, 'up');
                        }}
                        disabled={index === 0}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveCategory(category.id, 'down');
                        }}
                        disabled={index === sortedCategories.length - 1}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
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
                              Are you sure you want to delete "{category.name}"? This will unassign all products from this category.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(category.id)} className="bg-red-600 hover:bg-red-700">
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

          {categories.length === 0 && (
            <div className="text-center py-8">
              <Tag className="size-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-600">No categories created yet</p>
            </div>
          )}
        </div>

        {/* Product Assignment */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Product Assignment</h2>
            {selectedCategory && (
              <Button onClick={handleSaveAssignments}>
                <Save className="size-4 mr-2" />
                Save Assignments
              </Button>
            )}
          </div>

          {selectedCategory ? (
            <div className="space-y-3">
              <div className="text-sm text-gray-600 mb-4">
                Select products to assign to the selected category
              </div>
              {products.map(product => (
                <div key={product.id} className="flex items-center space-x-3 p-3 border rounded-lg">
                  <Checkbox
                    id={product.id}
                    checked={categoryProducts.has(product.id)}
                    onCheckedChange={(checked) => handleProductToggle(product.id, checked as boolean)}
                  />
                  <label htmlFor={product.id} className="flex-1 cursor-pointer">
                    <div className="font-medium">{product.name}</div>
                    <div className="text-sm text-gray-600">
                      ${product.price.toFixed(2)} • Current: {product.category}
                    </div>
                  </label>
                </div>
              ))}

              {products.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-600">No products available</p>
                  <p className="text-sm text-gray-500">Add products first in Product Management</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <Palette className="size-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-600">Select a category to assign products</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}