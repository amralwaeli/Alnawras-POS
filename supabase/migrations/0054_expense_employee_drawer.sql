-- 0054: expenses can name the employee they were paid to (salary / cash advance), and say
-- they were paid out of the cash drawer, so the shift report lists them and takes them
-- off the expected cash.
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS employee_id   TEXT,
  ADD COLUMN IF NOT EXISTS employee_name TEXT,
  ADD COLUMN IF NOT EXISTS from_drawer   BOOLEAN NOT NULL DEFAULT false;
