import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Order } from '../models/types';

interface OrdersContextType {
  orders: Order[];
  setOrders: (o: Order[] | ((prev: Order[]) => Order[])) => void;
}

const OrdersContext = createContext<OrdersContextType | undefined>(undefined);

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  return (
    <OrdersContext.Provider value={{ orders, setOrders }}>
      {children}
    </OrdersContext.Provider>
  );
}

export const useOrders = () => {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error('useOrders must be used within OrdersProvider');
  return ctx;
};