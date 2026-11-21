import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Order } from '../models/types';

interface OrdersContextType {
  orders: Order[];
  setOrders: (o: Order[] | ((prev: Order[]) => Order[])) => void;
  /** True once the bill list has loaded successfully (screens must not say "nothing open" before). */
  ordersLoaded: boolean;
  setOrdersLoaded: (v: boolean) => void;
  /** Realtime channel subscribed (updates are arriving). */
  live: boolean;
  setLive: (v: boolean) => void;
}

const OrdersContext = createContext<OrdersContextType | undefined>(undefined);

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [live, setLive] = useState(false);
  return (
    <OrdersContext.Provider value={{ orders, setOrders, ordersLoaded, setOrdersLoaded, live, setLive }}>
      {children}
    </OrdersContext.Provider>
  );
}

export const useOrders = () => {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error('useOrders must be used within OrdersProvider');
  return ctx;
};