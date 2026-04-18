import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Order } from '../models/types';

// Shared order/item mapping helpers (used by sync engine too)
export const mapOrderItem = (item: any) => ({
  ...item,
  productName: item.product_name,
  addedAt: item.created_at ? new Date(item.created_at) : new Date(),
});

export const mapOrder = (order: any): Order => ({
  ...order,
  tableId: order.table_id,
  tableNumber: order.table_number,
  orderType: order.order_type ?? order.orderType ?? 'dine-in',
  paymentStatus: order.payment_status ?? order.paymentStatus ?? 'unpaid',
  createdAt: order.created_at ? new Date(order.created_at) : new Date(),
  billNumber: order.bill_number,
  items: (order.order_items || []).map(mapOrderItem),
});

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
