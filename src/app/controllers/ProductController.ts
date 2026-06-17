import { Product, Category, ProductImportData, User, Result } from '../models/types';
import { AuthController } from './AuthController';
import { mapProduct, mapCategory } from '../models/mappers';
import { supabase } from '../../lib/supabase';

export class ProductController {
  /**
   * Get all products from database
   */
  static async getProducts(user: User): Promise<Result<Product[]>> {
    // Kitchen needs canManageInventory, others need canViewTables
    const canView = user.role === 'kitchen'
      ? AuthController.hasPermission(user, 'canManageInventory')
      : AuthController.hasPermission(user, 'canViewTables');

    if (!canView) {
      return { success: false, error: 'Unauthorized: Cannot view products' };
    }

    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('branch_id', user.branchId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return { success: true, data: (data || []).map(mapProduct) };
    } catch (error) {
      console.error('Error fetching products:', error);
      return { success: false, error: 'Failed to fetch products' };
    }
  }

  /**
   * Add a new product
   */
  static async addProduct(
    productData: Omit<Product, 'id' | 'createdAt'>,
    user: User
  ): Promise<Result<Product>> {
    if (!AuthController.hasPermission(user, 'canManageInventory')) {
      return { success: false, error: 'Unauthorized: Cannot manage products' };
    }

    // --- INPUT VALIDATION ---
    if (!productData.name?.trim()) return { success: false, error: 'Product name is required' };
    if (productData.price < 0) return { success: false, error: 'Price cannot be negative' };
    if (productData.stock < 0) return { success: false, error: 'Stock cannot be negative' };
    if (!productData.categoryId) return { success: false, error: 'Category is required' };
    // ------------------------

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
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return { success: true, data: mapProduct(data) };
    } catch (error) {
      console.error('Error adding product:', error);
      return { success: false, error: 'Failed to add product' };
    }
  }

  /**
   * Update product
   */
  static async updateProduct(
    productId: string,
    updates: Partial<Product>,
    user: User
  ): Promise<Result<void>> {
    if (!AuthController.hasPermission(user, 'canManageInventory')) {
      return { success: false, error: 'Unauthorized: Cannot manage products' };
    }

    // --- INPUT VALIDATION ---
    if (updates.name !== undefined && !updates.name.trim()) return { success: false, error: 'Product name cannot be empty' };
    if (updates.price !== undefined && updates.price < 0) return { success: false, error: 'Price cannot be negative' };
    if (updates.stock !== undefined && updates.stock < 0) return { success: false, error: 'Stock cannot be negative' };
    // ------------------------

    try {
      // Build payload explicitly — only include fields that were actually provided
      const payload: Record<string, any> = {};
      if (updates.name !== undefined)               payload.name = updates.name;
      if ('categoryId' in updates)                  payload.category_id = updates.categoryId ?? null;
      if (updates.category !== undefined)            payload.category = updates.category;
      if (updates.price !== undefined)               payload.price = updates.price;
      if (updates.stock !== undefined)               payload.stock = updates.stock;
      if (updates.image !== undefined)               payload.image = updates.image;
      if (updates.sku !== undefined)                 payload.sku = updates.sku;
      if (updates.taxRate !== undefined)             payload.tax_rate = updates.taxRate;
      if (updates.reorderPoint !== undefined)        payload.reorder_point = updates.reorderPoint;
      if (updates.station !== undefined)             payload.station = updates.station;
      if (updates.availabilityStatus !== undefined) {
        payload.availability_status = updates.availabilityStatus;
        payload.kitchen_status      = updates.availabilityStatus;
      }
      if (updates.isActive !== undefined)            payload.is_active = updates.isActive;

      const { error } = await supabase
        .from('products')
        .update(payload)
        .eq('id', productId)
        .eq('branch_id', user.branchId);

      if (error) throw error;
      return { success: true, data: undefined };
    } catch (error) {
      console.error('updateProduct failed:', error);
      return { success: false, error: 'Failed to update product' };
    }
  }

  /**
   * Delete product (soft delete)
   */
  static async deleteProduct(productId: string, user: User): Promise<Result<void>> {
    try {
      const { error } = await supabase
        .from('products')
        .update({ is_active: false })
        .eq('id', productId)
        .eq('branch_id', user.branchId);
      if (error) throw error;
      return { success: true, data: undefined };
    } catch (error) {
      return { success: false, error: 'Failed to delete' };
    }
  }

  /**
   * Import products from Excel data (creates missing categories, batched inserts)
   */
  static async importProducts(
    importData: ProductImportData[],
    user: User
  ): Promise<Result<{ imported: number; errors?: string[] }>> {
    if (!AuthController.hasPermission(user, 'canImportProducts')) {
      return { success: false, error: 'Unauthorized: Cannot import products' };
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
          availability_status: 'available',
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

      return { success: true, data: { imported, errors: errors.length > 0 ? errors : undefined } };
    } catch (error) {
      return { success: false, error: 'Import failed' };
    }
  }
}

export class CategoryController {
  static async getCategories(user: User): Promise<Result<Category[]>> {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('branch_id', user.branchId)
        .eq('is_active', true)
        .order('display_order');
      if (error) throw error;
      return { success: true, data: (data || []).map(mapCategory) };
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'Failed to fetch categories' };
    }
  }

  static async addCategory(data: any, user: User): Promise<Result<Category>> {
    const { data: cat, error } = await supabase.from('categories').insert({
      id: `cat-${Date.now()}`,
      name: data.name,
      description: data.description || null,
      color: data.color || '#3B82F6',
      icon: data.icon || null,
      branch_id: user.branchId,
      is_active: true,
      display_order: data.displayOrder || 0,
    }).select().single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: mapCategory(cat) };
  }

  static async updateCategory(id: string, updates: any, user: User): Promise<Result<Category>> {
    // --- INPUT VALIDATION ---
    if (updates.name !== undefined && !updates.name.trim()) return { success: false, error: 'Category name cannot be empty' };
    // ------------------------

    const { data: cat, error } = await supabase.from('categories').update({
      name: updates.name,
      description: updates.description,
      color: updates.color,
      icon: updates.icon,
      display_order: updates.displayOrder,
    }).eq('id', id).eq('branch_id', user.branchId).select().single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: mapCategory(cat) };
  }

  static async deleteCategory(id: string, user: User): Promise<Result<void>> {
    const { error } = await supabase.from('categories').update({ is_active: false }).eq('id', id).eq('branch_id', user.branchId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: undefined };
  }
}
