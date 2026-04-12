import { usePOS } from '../context/POSContext';
import { Package, AlertTriangle } from 'lucide-react';

export function InventoryView() {
  const { products, currentUser } = usePOS();

  if (!currentUser) return null;

  const lowStockItems = products.filter(p => p.stock <= p.reorderPoint);
  const outOfStockItems = products.filter(p => p.stock === 0);

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="font-semibold text-2xl">Inventory Management</h1>
          <p className="text-gray-600">Monitor and manage product stock levels</p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="size-10 flex items-center justify-center bg-blue-100 rounded-lg">
                <Package className="size-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Products</p>
                <p className="text-2xl font-semibold">{products.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="size-10 flex items-center justify-center bg-yellow-100 rounded-lg">
                <AlertTriangle className="size-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Low Stock</p>
                <p className="text-2xl font-semibold">{lowStockItems.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="size-10 flex items-center justify-center bg-red-100 rounded-lg">
                <AlertTriangle className="size-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Out of Stock</p>
                <p className="text-2xl font-semibold">{outOfStockItems.length}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b">
            <h2 className="font-semibold">Product Inventory</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Product</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Category</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Stock</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Price</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {products.map(product => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={product.image}
                          alt={product.name}
                          className="size-10 object-cover rounded"
                        />
                        <span className="font-medium">{product.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">{product.category}</td>
                    <td className="px-4 py-3 text-right font-medium">{product.stock}</td>
                    <td className="px-4 py-3 text-right">${product.price.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            product.stock === 0
                              ? 'bg-red-100 text-red-700'
                              : product.stock <= product.reorderPoint
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {product.stock === 0 ? 'Out of Stock' : product.stock <= product.reorderPoint ? 'Low Stock' : 'In Stock'}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
