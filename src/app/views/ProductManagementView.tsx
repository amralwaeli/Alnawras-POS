import React, { useState, useRef } from 'react';
import { Plus, Edit, Trash2, Upload, Download, Package, Tag, DollarSign } from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

export function ProductManagementView() {
  const { products, categories, addProduct, updateProduct, deleteProduct, importProducts, addCategory, updateCategory, deleteCategory } = usePOS();
  const [activeTab, setActiveTab] = useState('products');
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [productFormData, setProductFormData] = useState({
    name: '',
    categoryId: '',
    category: '',
    price: '',
    stock: '',
    sku: '',
    taxRate: '8.25',
    reorderPoint: '',
  });

  const [categoryFormData, setCategoryFormData] = useState({
    name: '',
    description: '',
    color: '#3B82F6',
    icon: '',
    displayOrder: '0',
  });

  const resetProductForm = () => {
    setProductFormData({
      name: '',
      categoryId: '',
      category: '',
      price: '',
      stock: '',
      sku: '',
      taxRate: '8.25',
      reorderPoint: '',
    });
    setEditingProduct(null);
  };

  const resetCategoryForm = () => {
    setCategoryFormData({
      name: '',
      description: '',
      color: '#3B82F6',
      icon: '',
      displayOrder: '0',
    });
    setEditingCategory(null);
  };

  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const selectedCategory = categories.find(c => c.id === productFormData.categoryId);
    const productData = {
      name: productFormData.name,
      categoryId: productFormData.categoryId,
      category: selectedCategory?.name || productFormData.category,
      price: parseFloat(productFormData.price),
      stock: parseInt(productFormData.stock),
      sku: productFormData.sku || undefined,
      taxRate: parseFloat(productFormData.taxRate),
      reorderPoint: parseInt(productFormData.reorderPoint) || 0,
      branchId: 'branch-1', // TODO: Get from current user
      kitchenStatus: 'available' as const,
      isActive: true,
    };

    try {
      if (editingProduct) {
        const result = await updateProduct(editingProduct.id, productData);
        if (result.success) {
          toast.success('Product updated successfully');
          setIsProductDialogOpen(false);
          resetProductForm();
        } else {
          toast.error(result.error || 'Failed to update product');
        }
      } else {
        const result = await addProduct(productData);
        if (result.success) {
          toast.success('Product added successfully');
          setIsProductDialogOpen(false);
          resetProductForm();
        } else {
          toast.error(result.error || 'Failed to add product');
        }
      }
    } catch (error) {
      toast.error('An error occurred');
    }
  };

  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const categoryData = {
      name: categoryFormData.name,
      description: categoryFormData.description || undefined,
      color: categoryFormData.color,
      icon: categoryFormData.icon || undefined,
      displayOrder: parseInt(categoryFormData.displayOrder),
      isActive: true,
      branchId: 'branch-1', // TODO: Get from current user
    };

    try {
      if (editingCategory) {
        const result = await updateCategory(editingCategory.id, categoryData);
        if (result.success) {
          toast.success('Category updated successfully');
          setIsCategoryDialogOpen(false);
          resetCategoryForm();
        } else {
          toast.error(result.error || 'Failed to update category');
        }
      } else {
        const result = await addCategory(categoryData);
        if (result.success) {
          toast.success('Category added successfully');
          setIsCategoryDialogOpen(false);
          resetCategoryForm();
        } else {
          toast.error(result.error || 'Failed to add category');
        }
      }
    } catch (error) {
      toast.error('An error occurred');
    }
  };

  const handleEditProduct = (product: any) => {
    setEditingProduct(product);
    setProductFormData({
      name: product.name,
      categoryId: product.categoryId || '',
      category: product.category,
      price: product.price.toString(),
      stock: product.stock.toString(),
      sku: product.sku || '',
      taxRate: product.taxRate.toString(),
      reorderPoint: product.reorderPoint.toString(),
    });
    setIsProductDialogOpen(true);
  };

  const handleEditCategory = (category: any) => {
    setEditingCategory(category);
    setCategoryFormData({
      name: category.name,
      description: category.description || '',
      color: category.color,
      icon: category.icon || '',
      displayOrder: category.displayOrder.toString(),
    });
    setIsCategoryDialogOpen(true);
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
      const result = await deleteProduct(productId);
      if (result.success) {
        toast.success('Product deleted successfully');
      } else {
        toast.error(result.error || 'Failed to delete product');
      }
    } catch (error) {
      toast.error('An error occurred');
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
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

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // Transform Excel data to import format
      const importData = jsonData.map((row: any) => ({
        name: row.name || row.Name || row.product_name || '',
        category: row.category || row.Category || row.category_name || '',
        price: parseFloat(row.price || row.Price || 0),
        stock: parseInt(row.stock || row.Stock || row.quantity || 0),
        sku: row.sku || row.SKU || row.product_code || undefined,
        taxRate: parseFloat(row.tax_rate || row.taxRate || row.TaxRate || 8.25),
        reorderPoint: parseInt(row.reorder_point || row.reorderPoint || row.ReorderPoint || 0),
      })).filter(item => item.name && item.category);

      if (importData.length === 0) {
        toast.error('No valid products found in the file');
        return;
      }

      const result = await importProducts(importData);
      if (result.success) {
        toast.success(`Successfully imported ${result.imported} products`);
        if (result.errors && result.errors.length > 0) {
          console.warn('Import errors:', result.errors);
          toast.warning(`${result.errors.length} products had errors during import`);
        }
      } else {
        toast.error(result.error || 'Failed to import products');
      }
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Failed to process the file');
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const downloadTemplate = () => {
    const template = [
      {
        name: 'Sample Product',
        category: 'Appetizers',
        price: 12.99,
        stock: 50,
        sku: 'PROD-001',
        tax_rate: 8.25,
        reorder_point: 10,
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(template);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
    XLSX.writeFile(workbook, 'product_import_template.xlsx');
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Product Management</h1>
          <p className="text-gray-600">Manage products and categories for your menu</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button onClick={() => setIsProductDialogOpen(true)} disabled={!categories.length}>
                <Plus className="size-4 mr-2" />
                Add Product
              </Button>
              <Button variant="outline" onClick={downloadTemplate}>
                <Download className="size-4 mr-2" />
                Download Template
              </Button>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="size-4 mr-2" />
                Import Excel
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileImport}
                className="hidden"
              />
            </div>
            {!categories.length && (
              <p className="text-sm text-amber-600">
                Create categories first before adding products
              </p>
            )}
          </div>

          {importing && (
            <div className="text-center py-4">
              <p className="text-gray-600">Importing products...</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map(product => (
              <Card key={product.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{product.name}</CardTitle>
                  <Badge variant="secondary">{product.category}</Badge>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <DollarSign className="size-4 text-gray-500" />
                      <span className="font-semibold">${product.price.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Package className="size-4 text-gray-500" />
                      <span>Stock: {product.stock}</span>
                    </div>
                    {product.sku && (
                      <div className="text-sm text-gray-600">SKU: {product.sku}</div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEditProduct(product)}
                      className="flex-1"
                    >
                      <Edit className="size-4 mr-1" />
                      Edit
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700">
                          <Trash2 className="size-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Product</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{product.name}"? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteProduct(product.id)} className="bg-red-600 hover:bg-red-700">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {products.length === 0 && (
            <div className="text-center py-12">
              <Package className="size-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No products found</h3>
              <p className="text-gray-600 mb-4">Get started by adding your first product.</p>
              <Button onClick={() => setIsProductDialogOpen(true)} disabled={!categories.length}>
                <Plus className="size-4 mr-2" />
                Add Product
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="categories" className="space-y-6">
          <div className="flex items-center justify-between">
            <Button onClick={() => setIsCategoryDialogOpen(true)}>
              <Plus className="size-4 mr-2" />
              Add Category
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map(category => (
              <Card key={category.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    {category.icon && <span>{category.icon}</span>}
                    <CardTitle className="text-lg">{category.name}</CardTitle>
                  </div>
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                </CardHeader>
                <CardContent>
                  {category.description && (
                    <p className="text-sm text-gray-600 mb-4">{category.description}</p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEditCategory(category)}
                      className="flex-1"
                    >
                      <Edit className="size-4 mr-1" />
                      Edit
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700">
                          <Trash2 className="size-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Category</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{category.name}"? This will affect all products in this category.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteCategory(category.id)} className="bg-red-600 hover:bg-red-700">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {categories.length === 0 && (
            <div className="text-center py-12">
              <Tag className="size-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No categories found</h3>
              <p className="text-gray-600 mb-4">Create categories to organize your products.</p>
              <Button onClick={() => setIsCategoryDialogOpen(true)}>
                <Plus className="size-4 mr-2" />
                Add Category
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Product Dialog */}
      <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Edit Product' : 'Add New Product'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleProductSubmit} className="space-y-4">
            <div>
              <Label htmlFor="product-name">Product Name</Label>
              <Input
                id="product-name"
                value={productFormData.name}
                onChange={(e) => setProductFormData(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="product-category">Category</Label>
              <Select
                value={productFormData.categoryId}
                onValueChange={(value) => setProductFormData(prev => ({ ...prev, categoryId: value }))}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(category => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="product-price">Price</Label>
                <Input
                  id="product-price"
                  type="number"
                  step="0.01"
                  value={productFormData.price}
                  onChange={(e) => setProductFormData(prev => ({ ...prev, price: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="product-stock">Stock</Label>
                <Input
                  id="product-stock"
                  type="number"
                  value={productFormData.stock}
                  onChange={(e) => setProductFormData(prev => ({ ...prev, stock: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div>
              <Label htmlFor="product-sku">SKU (Optional)</Label>
              <Input
                id="product-sku"
                value={productFormData.sku}
                onChange={(e) => setProductFormData(prev => ({ ...prev, sku: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="product-tax">Tax Rate (%)</Label>
                <Input
                  id="product-tax"
                  type="number"
                  step="0.01"
                  value={productFormData.taxRate}
                  onChange={(e) => setProductFormData(prev => ({ ...prev, taxRate: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="product-reorder">Reorder Point</Label>
                <Input
                  id="product-reorder"
                  type="number"
                  value={productFormData.reorderPoint}
                  onChange={(e) => setProductFormData(prev => ({ ...prev, reorderPoint: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsProductDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingProduct ? 'Update' : 'Add'} Product
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
                placeholder="e.g., 🍽️, 🥗, 🍰"
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