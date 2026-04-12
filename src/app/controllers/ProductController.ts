import { Product } from '../models/types';

export class ProductController {
  /**
   * Get all products
   */
  static getProducts(products: Product[]): Product[] {
    return products;
  }

  /**
   * Get products by category
   */
  static getProductsByCategory(products: Product[], category: string): Product[] {
    if (category === 'All') {
      return products;
    }
    return products.filter(product => product.category === category);
  }

  /**
   * Get unique categories
   */
  static getCategories(products: Product[]): string[] {
    const categories = new Set(products.map(p => p.category));
    return ['All', ...Array.from(categories)];
  }

  /**
   * Search products by name or SKU
   */
  static searchProducts(products: Product[], query: string): Product[] {
    const lowerQuery = query.toLowerCase();
    return products.filter(
      product =>
        product.name.toLowerCase().includes(lowerQuery) ||
        product.sku.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get product by ID
   */
  static getProductById(products: Product[], productId: string): Product | undefined {
    return products.find(p => p.id === productId);
  }

  /**
   * Update product
   */
  static updateProduct(
    products: Product[],
    productId: string,
    updates: Partial<Product>
  ): Product[] {
    return products.map(product =>
      product.id === productId ? { ...product, ...updates } : product
    );
  }

  /**
   * Adjust stock manually
   */
  static adjustStock(
    products: Product[],
    productId: string,
    adjustment: number,
    reason: 'restock' | 'damage' | 'correction'
  ): {
    success: boolean;
    updatedProducts?: Product[];
    error?: string;
  } {
    const product = products.find(p => p.id === productId);

    if (!product) {
      return {
        success: false,
        error: 'Product not found',
      };
    }

    const newStock = product.stock + adjustment;

    if (newStock < 0) {
      return {
        success: false,
        error: 'Stock cannot be negative',
      };
    }

    const updatedProducts = products.map(p =>
      p.id === productId ? { ...p, stock: newStock } : p
    );

    return {
      success: true,
      updatedProducts,
    };
  }

  /**
   * Add new product
   */
  static addProduct(products: Product[], newProduct: Omit<Product, 'id'>): Product[] {
    const product: Product = {
      ...newProduct,
      id: `prod-${Date.now()}`,
    };
    return [...products, product];
  }

  /**
   * Delete product
   */
  static deleteProduct(products: Product[], productId: string): Product[] {
    return products.filter(p => p.id !== productId);
  }
}
