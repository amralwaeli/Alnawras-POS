{/* Footer */}
          <div className="border-t border-gray-100 bg-white p-4 shrink-0 space-y-3">
            {selectedOrder && selectedOrder.items.length > 0 && (
              <div className="text-xs space-y-1 text-gray-500">
                <div className="flex justify-between">
                  <span>Sub-Total</span>
                  <span>${selectedOrder.subtotal.toFixed(2)}</span>
                </div>
                {selectedOrder.discount > 0 && (
                  <div className="flex justify-between text-red-500">
                    <span>Discount</span>
                    <span>- ${selectedOrder.discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Tax</span>
                  <span>${selectedOrder.tax.toFixed(2)}</span>
                </div>
                {cart.length > 0 && (
                  <div className="flex justify-between font-semibold text-amber-600 border-t border-amber-100 pt-1">
                    <span>+ New items</span>
                    <span>+ ${cartTotal.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-gray-800 text-sm border-t border-gray-200 pt-1.5">
                  <span>Total</span>
                  <span>${(selectedOrder.total + (cart.length > 0 ? cartTotal : 0)).toFixed(2)}</span>
                </div>
              </div>
            )}

            {cart.length > 0 ? (
              <button
                onClick={submitCart}
                className="w-full bg-amber-500 hover:bg-amber-600 active:scale-95 transition-all text-white font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 shadow-sm"
              >
                <Plus className="size-4" />
                {'Add ' + cartCount + ' item' + (cartCount !== 1 ? 's' : '') + ' to Order'}
              </button>
            ) : (
              <button
                disabled
                className="w-full bg-gray-100 text-gray-400 font-semibold py-3.5 rounded-xl text-sm cursor-not-allowed"
              >
                Select items to add
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}