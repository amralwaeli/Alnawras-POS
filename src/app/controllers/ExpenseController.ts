import { supabase } from '../../lib/supabase';
import type { Expense, User } from '../models/types';

/** Saves one expense (Accounting screen, and the cashier's "Pay out from drawer"). */
export async function addExpense(
  input: { category: string; description: string; amount: number; date: string; employee?: { id: string; name: string }; fromDrawer: boolean },
  user: User,
): Promise<{ success: boolean; expense?: Expense; error?: string }> {
  const id = `exp-${crypto.randomUUID()}`;
  const { error } = await supabase.from('expenses').insert([{
    id,
    branch_id: user.branchId,
    category: input.category,
    description: input.description,
    amount: input.amount,
    date: input.date,
    created_by: user.id,
    created_by_name: user.name,
    status: 'approved',
    employee_id: input.employee?.id ?? null,
    employee_name: input.employee?.name ?? null,
    from_drawer: input.fromDrawer,
  }]);
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    expense: {
      id, branchId: user.branchId, category: input.category, description: input.description, amount: input.amount,
      date: new Date(input.date), createdBy: user.id, createdByName: user.name, status: 'approved',
      employeeId: input.employee?.id, employeeName: input.employee?.name, fromDrawer: input.fromDrawer,
    },
  };
}
