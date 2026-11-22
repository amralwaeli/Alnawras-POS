-- 0044: an employee can do more than one job (a cashier who is also HR, the
-- accountant, and sometimes a waiter). `role` stays their main job; extra_roles
-- lists the others, and the app grants the combined permissions. Kept on both
-- users (what sign-in reads) and employees (the HR record), like `role`.

ALTER TABLE public.users     ADD COLUMN IF NOT EXISTS extra_roles text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS extra_roles text[] NOT NULL DEFAULT '{}';

-- Only real, assignable roles (never admin) may be added.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_extra_roles_valid;
ALTER TABLE public.users ADD CONSTRAINT users_extra_roles_valid CHECK (extra_roles <@ ARRAY[
  'cashier','waiter','swaiter','kitchen','hr','juice','staff','accounting','manager','supervisor']::text[]);
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_extra_roles_valid;
ALTER TABLE public.employees ADD CONSTRAINT employees_extra_roles_valid CHECK (extra_roles <@ ARRAY[
  'cashier','waiter','swaiter','kitchen','hr','juice','staff','accounting','manager','supervisor']::text[]);

-- users has column-level grants (0030 hides the PIN columns): allow this one too.
GRANT SELECT (extra_roles), INSERT (extra_roles), UPDATE (extra_roles) ON public.users TO authenticated;

NOTIFY pgrst, 'reload schema';
