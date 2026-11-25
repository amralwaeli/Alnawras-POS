-- 0046: a "cancellation" role — the person who cancels items a customer no longer
-- wants (with the owner). Allowed as a main role and as an extra role (0044).

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role = ANY (ARRAY[
  'admin','cashier','waiter','swaiter','kitchen','hr','juice','staff','accounting','manager','supervisor','cancellation']::text[]));

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_extra_roles_valid;
ALTER TABLE public.users ADD CONSTRAINT users_extra_roles_valid CHECK (extra_roles <@ ARRAY[
  'cashier','waiter','swaiter','kitchen','hr','juice','staff','accounting','manager','supervisor','cancellation']::text[]);
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_extra_roles_valid;
ALTER TABLE public.employees ADD CONSTRAINT employees_extra_roles_valid CHECK (extra_roles <@ ARRAY[
  'cashier','waiter','swaiter','kitchen','hr','juice','staff','accounting','manager','supervisor','cancellation']::text[]);
