-- 0057: days off. Each employee has 2 days off a month (any dates), recorded on the Leave page
-- by admin / HR / manager / accountant (saved as approved 'day_off' leave). Days off above 2 in
-- a month are deducted from that month's payroll at the daily rate (monthly salary / 30).
ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_leave_type_check;
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_leave_type_check
  CHECK (leave_type IN ('annual','sick','emergency','unpaid','other','day_off'));

ALTER TABLE public.payroll_summary
  ADD COLUMN IF NOT EXISTS days_off INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS days_off_deduction DECIMAL(10,2) NOT NULL DEFAULT 0;
