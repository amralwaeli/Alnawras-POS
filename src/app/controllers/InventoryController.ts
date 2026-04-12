import { Product, InventoryItem } from '../models/types';
import { isLowStock, getInventoryStatus } from '../models/businessLogic';

export class InventoryController {
  /**
   * Get all inventory items with status
   */
  static getInventory(products: Product[]): InventoryItem[] {
    return products.map(product => ({
      productId: product.id,
      productName: product.name,
      stockLevel: product.stock,
      reorderPoint: product.reorderPoint,
      lastUpdated: new Date(),
      status: getInventoryStatus(product),
    }));
  }

  /**
   * Get low stock items (below reorder point)
   */
  static getLowStockItems(products: Product[]): InventoryItem[] {
    return products
      .filter(isLowStock)
      .map(product => ({
        productId: product.id,
        productName: product.name,
        stockLevel: product.stock,
        reorderPoint: product.reorderPoint,
        lastUpdated: new Date(),
        status: getInventoryStatus(product),
      }))
      .sort((a, b) => a.stockLevel - b.stockLevel);
  }

  /**
   * Get out of stock items
   */
  static getOutOfStockItems(products: Product[]): InventoryItem[] {
    return products
      .filter(product => product.stock === 0)
      .map(product => ({
        productId: product.id,
        productName: product.name,
        stockLevel: product.stock,
        reorderPoint: product.reorderPoint,
        lastUpdated: new Date(),
        status: 'out-of-stock' as const,
      }));
  }

  /**
   * Record restock
   */
  static recordRestock(
    products: Product[],
    productId: string,
    quantity: number
  ): {
    success: boolean;
    updatedProducts?: Product[];
    message?: string;
    error?: string;
  } {
    if (quantity <= 0) {
      return {
        success: false,
        error: 'Restock quantity must be positive',
      };
    }

    const product = products.find(p => p.id === productId);

    if (!product) {
      return {
        success: false,
        error: 'Product not found',
      };
    }

    const updatedProducts = products.map(p =>
      p.id === productId ? { ...p, stock: p.stock + quantity } : p
    );

    return {
      success: true,
      updatedProducts,
      message: `Added ${quantity} units to ${product.name}. New stock: ${product.stock + quantity}`,
    };
  }

  /**
   * Check stock for a specific product
   */
  static checkStock(products: Product[], productId: string): {
    productId: string;
    productName: string;
    stock: number;
    status: 'in-stock' | 'low-stock' | 'out-of-stock';
    needsReorder: boolean;
  } | null {
    const product = products.find(p => p.id === productId);

    if (!product) return null;

    return {
      productId: product.id,
      productName: product.name,
      stock: product.stock,
      status: getInventoryStatus(product),
      needsReorder: isLowStock(product),
    };
  }

  /**
   * Get inventory summary statistics
   */
  static getInventorySummary(products: Product[]): {
    totalProducts: number;
    totalStockValue: number;
    lowStockCount: number;
    outOfStockCount: number;
    categories: {
      category: string;
      productCount: number;
      totalStock: number;
    }[];
  } {
    const totalProducts = products.length;
    const totalStockValue = products.reduce((sum, p) => sum + (p.stock * p.price), 0);
    const lowStockCount = products.filter(isLowStock).length;
    const outOfStockCount = products.filter(p => p.stock === 0).length;

    const categoryMap: Record<string, { productCount: number; totalStock: number }> = {};

    products.forEach(product => {
      if (!categoryMap[product.category]) {
        categoryMap[product.category] = { productCount: 0, totalStock: 0 };
      }
      categoryMap[product.category].productCount += 1;
      categoryMap[product.category].totalStock += product.stock;
    });

    const categories = Object.entries(categoryMap).map(([category, data]) => ({
      category,
      productCount: data.productCount,
      totalStock: data.totalStock,
    }));

    return {
      totalProducts,
      totalStockValue: Math.round(totalStockValue * 100) / 100,
      lowStockCount,
      outOfStockCount,
      categories,
    };
  }
}
