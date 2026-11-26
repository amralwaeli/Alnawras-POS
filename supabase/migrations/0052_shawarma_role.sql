-- 0052: a "shawarma" role, like kitchen and juice: sees and switches off only the
-- shawarma station's items. Allowed as a main role and as an extra role (0044, 0046).

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role = ANY (ARRAY[
  'admin','cashier','waiter','swaiter','kitchen','hr','juice','shawarma','staff','accounting','manager','supervisor','cancellation']::text[]));

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_extra_roles_valid;
ALTER TABLE public.users ADD CONSTRAINT users_extra_roles_valid CHECK (extra_roles <@ ARRAY[
  'cashier','waiter','swaiter','kitchen','hr','juice','shawarma','staff','accounting','manager','supervisor','cancellation']::text[]);
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_extra_roles_valid;
ALTER TABLE public.employees ADD CONSTRAINT employees_extra_roles_valid CHECK (extra_roles <@ ARRAY[
  'cashier','waiter','swaiter','kitchen','hr','juice','shawarma','staff','accounting','manager','supervisor','cancellation']::text[]);
