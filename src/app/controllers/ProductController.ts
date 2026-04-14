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
    if (!AuthController.hasPermission(user, 'canViewTables')) {
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
        station: product.station ?? 'kitchen',
        kitchenStatus: product.kitchen_status ?? 'available',
        availabilityStatus: product.availability_status ?? product.kitchen_status ?? 'available',
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
          station: productData.station || 'kitchen',
          availability_status: productData.availabilityStatus || 'available',
          kitchen_status: productData.availabilityStatus || 'available',
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
        station: data.station,
        availabilityStatus: data.availability_status,
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
          station: updates.station,
          availability_status: updates.availabilityStatus,
          kitchen_status: updates.availabilityStatus,
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
        station: data.station,
        availabilityStatus: data.availability_status,
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
   * Import products from Excel data (Full batch logic)
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

      const { data: existingCategories } = await supabase
        .from('categories')
        .select('id, name')
        .eq('branch_id', user.branchId)
        .eq('is_active', true);

      const categoryMap = new Map(
        existingCategories?.map(c => [c.name.toLowerCase(), c.id]) || []
      );

      const uniqueNewCategories = [
        ...new Set(
          importData
            .map(item => item.category?.trim())
            .filter(name => name && !categoryMap.has(name.toLowerCase()))
        ),
      ];

      if (uniqueNewCategories.length > 0) {
        const categoryRows = uniqueNewCategories.map((name, i) => ({
          id: `cat-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 6)}`,
          name,
          branch_id: user.branchId,
          is_active: true,
          display_order: 0,
        }));

        const { data: newCats, error: catBatchError } = await supabase
          .from('categories')
          .insert(categoryRows)
          .select('id, name');

        if (!catBatchError) {
          newCats?.forEach(c => categoryMap.set(c.name.toLowerCase(), c.id));
        }
      }

      const productRows: any[] = [];
      importData.forEach((item, i) => {
        const categoryId = categoryMap.get(item.category?.trim().toLowerCase());
        if (!categoryId) {
          errors.push(`Skipped "${item.name}": Category missing`);
          return;
        }
        productRows.push({
          id: `prod-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 6)}`,
          name: item.name,
          category_id: categoryId,
          category: item.category?.trim(),
          price: isNaN(item.price) ? 0 : item.price,
          stock: isNaN(item.stock) ? 0 : item.stock,
          sku: item.sku || null,
          tax_rate: item.taxRate || 0,
          reorder_point: item.reorderPoint || 0,
          image: item.image || null,
          branch_id: user.branchId,
          is_active: true,
          station: 'kitchen',
          availability_status: 'available'
        });
      });

      const CHUNK_SIZE = 50;
      for (let i = 0; i < productRows.length; i += CHUNK_SIZE) {
        const chunk = productRows.slice(i, i + CHUNK_SIZE);
        const { error: prodError } = await supabase.from('products').insert(chunk);
        if (prodError) {
            errors.push(`Chunk error: ${prodError.message}`);
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
      return { success: false, error: 'Import failed' };
    }
  }

  static getProductsByCategory(products: Product[], category: string): Product[] {
    return category === 'All' ? products : products.filter(p => p.category === category);
  }

  static getCategories(products: Product[]): string[] {
    const categories = new Set(products.map(p => p.category));
    return ['All', ...Array.from(categories)];
  }

  static searchProducts(products: Product[], query: string): Product[] {
    const q = query.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q));
  }
}

export class CategoryController {
  static async getCategories(user: User) {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('branch_id', user.branchId)
        .eq('is_active', true)
        .order('display_order');
      if (error) throw error;
      return { success: true, categories: data.map(c => ({
          id: c.id,
          name: c.name,
          description: c.description,
          color: c.color,
          icon: c.icon,
          displayOrder: c.display_order,
          isActive: c.is_active,
          branchId: c.branch_id,
          createdAt: new Date(c.created_at)
      }))};
    } catch (e) { return { success: false }; }
  }

  static async addCategory(data: any, user: User) {
    const { data: cat, error } = await supabase.from('categories').insert({
        id: `cat-${Date.now()}`,
        name: data.name,
        branch_id: user.branchId,
        is_active: true,
        display_order: data.displayOrder || 0
    }).select().single();
    return { success: !error, category: cat, error: error?.message };
  }

  static async updateCategory(id: string, updates: any, user: User) {
    const { data: cat, error } = await supabase.from('categories').update({
        name: updates.name,
        display_order: updates.displayOrder
    }).eq('id', id).select().single();
    return { success: !error, category: cat, error: error?.message };
  }

  static async deleteCategory(id: string, user: User) {
    const { error } = await supabase.from('categories').update({ is_active: false }).eq('id', id);
    return { success: !error };
  }
}