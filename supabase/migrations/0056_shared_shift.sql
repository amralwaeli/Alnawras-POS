-- 0056: one shift for the whole restaurant. The first cashier opens it (e.g. 10 am), the next
-- one carries on in the same shift (e.g. from 12 pm), and whoever is there at closing ends it.
-- user_name = who opened it; closed_by_name = who ended it.
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS closed_by_name TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS shifts_one_open_per_branch ON public.shifts (branch_id) WHERE status = 'open';
