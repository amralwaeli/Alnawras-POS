import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Product, Category, User } from '../models/types';
import { ProductController, CategoryController } from '../controllers/ProductController';

interface CatalogContextType {
  products: Product[];
  categories: Category[];
  setProducts: (p: Product[]) => void;
  setCategories: (c: Category[]) => void;
  updateProduct: (id: string, up: any) => Promise<any>;
  addProduct: (p: any) => Promise<any>;
  deleteProduct: (id: string) => Promise<any>;
  importProducts: (data: any[]) => Promise<any>;
  addCategory: (c: any) => Promise<any>;
  updateCategory: (id: string, up: any) => Promise<any>;
  deleteCategory: (id: string) => Promise<any>;
}

const CatalogContext = createContext<CatalogContextType | undefined>(undefined);

export function CatalogProvider({ children, currentUser }: { children: ReactNode; currentUser: User | null }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const updateProduct = (id: string, up: any) => ProductController.updateProduct(id, up, currentUser!);
  const addProduct    = (p: any) => ProductController.addProduct(p, currentUser!);
  const deleteProduct = (id: string) => ProductController.deleteProduct(id, currentUser!);
  const importProducts = (data: any[]) => ProductController.importProducts(data, currentUser!);

  const addCategory = async (c: any) => CategoryController.addCategory(c, currentUser!);

  const updateCategory = async (id: string, up: any) => {
    const res = await CategoryController.updateCategory(id, up, currentUser!);
    if (res.success) {
      setCategories(prev =>
        prev.map(cat => cat.id === id ? { ...cat, ...up } : cat)
            .sort((a, b) => a.displayOrder - b.displayOrder)
      );
    }
    return res;
  };

  const deleteCategory = async (id: string) => {
    const res = await CategoryController.deleteCategory(id, currentUser!);
    if (res.success) setCategories(prev => prev.filter(c => c.id !== id));
    return res;
  };

  return (
    <CatalogContext.Provider value={{
      products, categories, setProducts, setCategories,
      updateProduct, addProduct, deleteProduct, importProducts,
      addCategory, updateCategory, deleteCategory,
    }}>
      {children}
    </CatalogContext.Provider>
  );
}

export const useCatalog = () => {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be used within CatalogProvider');
  return ctx;
};
