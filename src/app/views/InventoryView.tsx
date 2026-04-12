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