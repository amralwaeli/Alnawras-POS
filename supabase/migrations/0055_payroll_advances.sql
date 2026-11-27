-- 0055: salary advances (expenses with category 'salary' paid to an employee, migration 0054)
-- come off that employee's next salary. Payroll for month M is paid on the 7th of month M+1
-- and deducts the advances dated from the 8th of M to the 7th of M+1.
ALTER TABLE public.payroll_summary ADD COLUMN IF NOT EXISTS salary_advances DECIMAL(10,2) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_expenses_employee_date ON public.expenses (employee_id, date) WHERE employee_id IS NOT NULL;
