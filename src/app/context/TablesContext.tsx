import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Table, User } from '../models/types';
import { TableController } from '../controllers/TableController';

interface TablesContextType {
  tables: Table[];
  setTables: (t: Table[]) => void;
  updateTable: (id: string, up: any) => Promise<any>;
  addTable: (t: any) => Promise<any>;
  deleteTable: (id: string) => Promise<any>;
}

const TablesContext = createContext<TablesContextType | undefined>(undefined);

export function TablesProvider({ children, currentUser }: { children: ReactNode; currentUser: User | null }) {
  const [tables, setTables] = useState<Table[]>([]);

  const updateTable = (id: string, up: any) => TableController.updateTable(id, up, currentUser!);
  const addTable    = (t: any) => TableController.addTable(t, currentUser!);
  const deleteTable = (id: string) => TableController.deleteTable(id, currentUser!);

  return (
    <TablesContext.Provider value={{ tables, setTables, updateTable, addTable, deleteTable }}>
      {children}
    </TablesContext.Provider>
  );
}

export const useTables = () => {
  const ctx = useContext(TablesContext);
  if (!ctx) throw new Error('useTables must be used within TablesProvider');
  return ctx;
};
