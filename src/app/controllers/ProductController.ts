import { Product, Category, ProductImportData, User } from '../models/types';
import { AuthController } from './AuthController';
import { supabase } from '../../lib/supabase';

export class ProductController {
  /**
   * Get all products from database
   */
  static async getProducts(user: User): Promise<{
    success: boolean;
    products?: Product[];
    error?: string;
  }> {
    if (!AuthController.hasPermission(user, 'canManageInventory')) {
      return {
        success: false,
        error: 'Unauthorized: Cannot view products',
      };
    }

    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('branch_id', user.branchId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      const products: Product[] = data.map(product => ({
        id: product.id,
        name: product.name,
        categoryId: product.category_id,
        category: product.category,
        price: product.price,
        stock: product.stock,
        image: product.image,
        sku: product.sku,
        taxRate: product.tax_rate,
        reorderPoint: product.reorder_point,
        branchId: product.branch_id,
        kitchenStatus: product.kitchen_status,
        isActive: product.is_active,
        createdAt: new Date(product.created_at),
      }));

      return {
        success: true,
        products,
      };
    } catch (error) {
      console.error('Error fetching products:', error);
      return {
        success: false,
        error: 'Failed to fetch products',
      };
    }
  }

  /**
   * Add a new product
   */
  static async addProduct(
    productData: Omit<Product, 'id' | 'createdAt'>,
    user: User
  ): Promise<{
    success: boolean;
    product?: Product;
    error?: string;
  }> {
    if (!AuthController.hasPermission(user, 'canManageInventory')) {
      return {
        success: false,
        error: 'Unauthorized: Cannot manage products',
      };
    }

    try {
      const { data, error } = await supabase
        .from('products')
        .insert({
          id: `prod-${Date.now()}`,
          name: productData.name,
          category_id: productData.categoryId,
          category: productData.category,
          price: productData.price,
          stock: productData.stock,
          image: productData.image,
          sku: productData.sku,
          tax_rate: productData.taxRate,
          reorder_point: productData.reorderPoint,
          branch_id: productData.branchId,
          kitchen_status: productData.kitchenStatus,
          is_active: productData.isActive,
        })
        .select()
        .single();

      if (error) throw error;

      const product: Product = {
        id: data.id,
        name: data.name,
        categoryId: data.category_id,
        category: data.category,
        price: data.price,
        stock: data.stock,
        image: data.image,
        sku: data.sku,
        taxRate: data.tax_rate,
        reorderPoint: data.reorder_point,
        branchId: data.branch_id,
        kitchenStatus: data.kitchen_status,
        isActive: data.is_active,
        createdAt: new Date(data.created_at),
      };

      return {
        success: true,
        product,
      };
    } catch (error) {
      console.error('Error adding product:', error);
      return {
        success: false,
        error: 'Failed to add product',
      };
    }
  }

  /**
   * Update product
   */
  static async updateProduct(
    productId: string,
    updates: Partial<Product>,
    user: User
  ): Promise<{
    success: boolean;
    product?: Product;
    error?: string;
  }> {
    if (!AuthController.hasPermission(user, 'canManageInventory')) {
      return {
        success: false,
        error: 'Unauthorized: Cannot manage products',
      };
    }

    try {
      const { data, error } = await supabase
        .from('products')
        .update({
          name: updates.name,
          category_id: updates.categoryId,
          category: updates.category,
          price: updates.price,
          stock: updates.stock,
          image: updates.image,
          sku: updates.sku,
          tax_rate: updates.taxRate,
          reorder_point: updates.reorderPoint,
          kitchen_status: updates.kitchenStatus,
          is_active: updates.isActive,
        })
        .eq('id', productId)
        .eq('branch_id', user.branchId)
        .select()
        .single();

      if (error) throw error;

      const product: Product = {
        id: data.id,
        name: data.name,
        categoryId: data.category_id,
        category: data.category,
        price: data.price,
        stock: data.stock,
        image: data.image,
        sku: data.sku,
        taxRate: data.tax_rate,
        reorderPoint: data.reorder_point,
        branchId: data.branch_id,
        kitchenStatus: data.kitchen_status,
        isActive: data.is_active,
        createdAt: new Date(data.created_at),
      };

      return {
        success: true,
        product,
      };
    } catch (error) {
      console.error('Error updating product:', error);
      return {
        success: false,
        error: 'Failed to update product',
      };
    }
  }

  /**
   * Delete product (soft delete)
   */
  static async deleteProduct(
    productId: string,
    user: User
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (!AuthController.hasPermission(user, 'canManageInventory')) {
      return {
        success: false,
        error: 'Unauthorized: Cannot manage products',
      };
    }

    try {
      const { error } = await supabase
        .from('products')
        .update({ is_active: false })
        .eq('id', productId)
        .eq('branch_id', user.branchId);

      if (error) throw error;

      return {
        success: true,
      };
    } catch (error) {
      console.error('Error deleting product:', error);
      return {
        success: false,
        error: 'Failed to delete product',
      };
    }
  }

  /**
   * Import products from Excel data
   */
  static async importProducts(
    importData: ProductImportData[],
    user: User
  ): Promise<{
    success: boolean;
    imported?: number;
    errors?: string[];
    error?: string;
  }> {
    if (!AuthController.hasPermission(user, 'canImportProducts')) {
      return {
        success: false,
        error: 'Unauthorized: Cannot import products',
      };
    }

    try {
      const errors: string[] = [];
      let imported = 0;

      // ── Step 1: fetch existing categories (1 round-trip) ──────────────────
      const { data: existingCategories } = await supabase
        .from('categories')
        .select('id, name')
        .eq('branch_id', user.branchId)
        .eq('is_active', true);

      const categoryMap = new Map(
        existingCategories?.map(c => [c.name.toLowerCase(), c.id]) || []
      );

      // ── Step 2: collect unique new category names ─────────────────────────
      const uniqueNewCategories = [
        ...new Set(
          importData
            .map(item => item.category?.trim())
            .filter(name => name && !categoryMap.has(name.toLowerCase()))
        ),
      ];

      // ── Step 3: batch-insert all new categories (1 round-trip) ───────────
      if (uniqueNewCategories.length > 0) {
        const now = Date.now();
        const categoryRows = uniqueNewCategories.map((name, i) => ({
          id: `cat-${now}-${i}-${Math.random().toString(36).substr(2, 6)}`,
          name,
          branch_id: user.branchId,
          is_active: true,
          display_order: 0,
        }));

        const { data: newCats, error: catBatchError } = await supabase
          .from('categories')
          .insert(categoryRows)
          .select('id, name');

        if (catBatchError) {
          // Non-fatal: log and continue; products without a category will be skipped
          console.error('Batch category insert error:', catBatchError.message);
        } else {
          newCats?.forEach(c => categoryMap.set(c.name.toLowerCase(), c.id));
        }
      }

      // ── Step 4: build product rows ────────────────────────────────────────
      const now = Date.now();
      const productRows: any[] = [];

      importData.forEach((item, i) => {
        const categoryId = categoryMap.get(item.category?.trim().toLowerCase());
        if (!categoryId) {
          errors.push(`Skipped "${item.name}": category "${item.category}" could not be created`);
          return;
        }
        // Guard against duplicate SKUs in the same batch
        const sku = item.sku && item.sku.trim() !== '' ? item.sku.trim() : undefined;
        productRows.push({
          id: `prod-${now}-${i}-${Math.random().toString(36).substr(2, 6)}`,
          name: item.name,
          category_id: categoryId,
          category: item.category?.trim(),
          price: isNaN(item.price) ? 0 : item.price,
          stock: isNaN(item.stock) ? 0 : item.stock,
          sku: sku || null,
          tax_rate: item.taxRate || 0,
          reorder_point: item.reorderPoint || 0,
          image: item.image || null,
          branch_id: user.branchId,
          is_active: true,
          kitchen_status: 'available',
        });
      });

      // ── Step 5: batch-insert products in chunks of 50 (handles API limits) ─
      const CHUNK_SIZE = 50;
      for (let i = 0; i < productRows.length; i += CHUNK_SIZE) {
        const chunk = productRows.slice(i, i + CHUNK_SIZE);
        const { error: prodError } = await supabase.from('products').insert(chunk);
        if (prodError) {
          // Retry individually to isolate bad rows (e.g. duplicate SKU)
          for (const row of chunk) {
            const { error: singleError } = await supabase.from('products').insert(row);
            if (singleError) {
              errors.push(`Failed to import "${row.name}": ${singleError.message}`);
            } else {
              imported++;
            }
          }
        } else {
          imported += chunk.length;
        }
      }

      return {
        success: true,
        imported,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      console.error('Error importing products:', error);
      return {
        success: false,
        error: 'Failed to import products',
      };
    }
  }

  /**
   * Get products by category (legacy method for compatibility)
   */
  static getProductsByCategory(products: Product[], category: string): Product[] {
    if (category === 'All') {
      return products;
    }
    return products.filter(product => product.category === category);
  }

  /**
   * Get unique categories (legacy method for compatibility)
   */
  static getCategories(products: Product[]): string[] {
    const categories = new Set(products.map(p => p.category));
    return ['All', ...Array.from(categories)];
  }

  /**
   * Search products by name or SKU (legacy method for compatibility)
   */
  static searchProducts(products: Product[], query: string): Product[] {
    const lowerQuery = query.toLowerCase();
    return products.filter(
      product =>
        product.name.toLowerCase().includes(lowerQuery) ||
        product.sku?.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get product by ID (legacy method for compatibility)
   */
  static getProductById(products: Product[], productId: string): Product | undefined {
    return products.find(p => p.id === productId);
  }
}

export class CategoryController {
  /**
   * Get all categories from database
   */
  static async getCategories(user: User): Promise<{
    success: boolean;
    categories?: Category[];
    error?: string;
  }> {
    if (!AuthController.hasPermission(user, 'canManageInventory')) {
      return {
        success: false,
        error: 'Unauthorized: Cannot view categories',
      };
    }

    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('branch_id', user.branchId)
        .eq('is_active', true)
        .order('display_order');

      if (error) throw error;

      const categories: Category[] = data.map(category => ({
        id: category.id,
        name: category.name,
        description: category.description,
        color: category.color,
        icon: category.icon,
        displayOrder: category.display_order,
        isActive: category.is_active,
        branchId: category.branch_id,
        createdAt: new Date(category.created_at),
      }));

      return {
        success: true,
        categories,
      };
    } catch (error) {
      console.error('Error fetching categories:', error);
      return {
        success: false,
        error: 'Failed to fetch categories',
      };
    }
  }

  /**
   * Add a new category
   */
  static async addCategory(
    categoryData: Omit<Category, 'id' | 'createdAt'>,
    user: User
  ): Promise<{
    success: boolean;
    category?: Category;
    error?: string;
  }> {
    if (!AuthController.hasPermission(user, 'canManageInventory')) {
      return {
        success: false,
        error: 'Unauthorized: Cannot manage categories',
      };
    }

    try {
      const { data, error } = await supabase
        .from('categories')
        .insert({
          id: `cat-${Date.now()}`,
          name: categoryData.name,
          description: categoryData.description,
          color: categoryData.color,
          icon: categoryData.icon,
          display_order: categoryData.displayOrder,
          is_active: categoryData.isActive,
          branch_id: categoryData.branchId,
        })
        .select()
        .single();

      if (error) throw error;

      const category: Category = {
        id: data.id,
        name: data.name,
        description: data.description,
        color: data.color,
        icon: data.icon,
        displayOrder: data.display_order,
        isActive: data.is_active,
        branchId: data.branch_id,
        createdAt: new Date(data.created_at),
      };

      return {
        success: true,
        category,
      };
    } catch (error) {
      console.error('Error adding category:', error);
      return {
        success: false,
        error: 'Failed to add category',
      };
    }
  }

  /**
   * Update category
   */
  static async updateCategory(
    categoryId: string,
    updates: Partial<Category>,
    user: User
  ): Promise<{
    success: boolean;
    category?: Category;
    error?: string;
  }> {
    if (!AuthController.hasPermission(user, 'canManageInventory')) {
      return {
        success: false,
        error: 'Unauthorized: Cannot manage categories',
      };
    }

    try {
      const { data, error } = await supabase
        .from('categories')
        .update({
          name: updates.name,
          description: updates.description,
          color: updates.color,
          icon: updates.icon,
          display_order: updates.displayOrder,
          is_active: updates.isActive,
        })
        .eq('id', categoryId)
        .eq('branch_id', user.branchId)
        .select()
        .single();

      if (error) throw error;

      const category: Category = {
        id: data.id,
        name: data.name,
        description: data.description,
        color: data.color,
        icon: data.icon,
        displayOrder: data.display_order,
        isActive: data.is_active,
        branchId: data.branch_id,
        createdAt: new Date(data.created_at),
      };

      return {
        success: true,
        category,
      };
    } catch (error) {
      console.error('Error updating category:', error);
      return {
        success: false,
        error: 'Failed to update category',
      };
    }
  }

  /**
   * Delete category (soft delete)
   */
  static async deleteCategory(
    categoryId: string,
    user: User
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (!AuthController.hasPermission(user, 'canManageInventory')) {
      return {
        success: false,
        error: 'Unauthorized: Cannot manage categories',
      };
    }

    try {
      const { error } = await supabase
        .from('categories')
        .update({ is_active: false })
        .eq('id', categoryId)
        .eq('branch_id', user.branchId);

      if (error) throw error;

      return {
        success: true,
      };
    } catch (error) {
      console.error('Error deleting category:', error);
      return {
        success: false,
        error: 'Failed to delete category',
      };
    }
  }
}
