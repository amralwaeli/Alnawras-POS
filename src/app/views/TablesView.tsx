{currentUser.role === 'waiter' && (
                        <button className="w-full mt-3 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                          Add Items
                        </button>
                      )}
                    </>
                  )}

                  {!order && currentUser.role === 'waiter' && (
                    <button className="w-full mt-3 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                      Start Order
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {visibleTables.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <TableIcon className="size-16 mb-4" />
            <p>No tables available</p>
          </div>
        )}
      </div>
    </div>
  );
}