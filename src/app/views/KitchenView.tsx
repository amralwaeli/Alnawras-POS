import { usePOS } from '../context/POSContext';
import { ChefHat, CheckCircle, XCircle } from 'lucide-react';

export function KitchenView() {
  const { products, currentUser, updateProduct } = usePOS();

  if (!currentUser) return null;

  const handleStatusChange = (productId: string, status: 'available' | 'out-of-stock' | 'finished') => {
    updateProduct(productId, { kitchenStatus: status });
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="font-semibold text-2xl">Kitchen Management</h1>
          <p className="text-gray-600">Mark items as finished or out of stock</p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="size-10 flex items-center justify-center bg-green-100 rounded-lg">
                <CheckCircle className="size-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Available</p>
                <p className="text-2xl font-semibold">
                  {products.filter(p => p.kitchenStatus === 'available').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="size-10 flex items-center justify-center bg-orange-100 rounded-lg">
                <ChefHat className="size-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Finished</p>
                <p className="text-2xl font-semibold">
                  {products.filter(p => p.kitchenStatus === 'finished').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="size-10 flex items-center justify-center bg-red-100 rounded-lg">
                <XCircle className="size-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Out of Stock</p>
                <p className="text-2xl font-semibold">
                  {products.filter(p => p.kitchenStatus === 'out-of-stock').length}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            <strong>Note:</strong> Marking items as "Finished" or "Out of Stock" will prevent new orders from being placed, but will not affect existing orders that have already been created.
          </p>
        </div>

        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b">
            <h2 className="font-semibold">Product Status</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Product</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Category</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Stock</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Current Status</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Actions</th>
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
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          product.kitchenStatus === 'available'
                            ? 'bg-green-100 text-green-700'
                            : product.kitchenStatus === 'finished'
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {product.kitchenStatus}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-2">
                        {product.kitchenStatus !== 'available' && (
                          <button
                            onClick={() => handleStatusChange(product.id, 'available')}
                            className="px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                          >
                            Mark Available
                          </button>
                        )}
                        {product.kitchenStatus !== 'finished' && (
                          <button
                            onClick={() => handleStatusChange(product.id, 'finished')}
                            className="px-3 py-1.5 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200"
                          >
                            Mark Finished
                          </button>
                        )}
                        {product.kitchenStatus !== 'out-of-stock' && (
                          <button
                            onClick={() => handleStatusChange(product.id, 'out-of-stock')}
                            className="px-3 py-1.5 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                          >
                            Out of Stock
                          </button>
                        )}
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
