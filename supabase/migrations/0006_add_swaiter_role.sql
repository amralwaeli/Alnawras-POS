-- 0006_add_swaiter_role.sql
-- Adds the 'swaiter' (Super Waiter) role — a normal waiter that can ALSO manage
-- invoices & quotations. The only schema change needed is to widen the
-- users.role CHECK constraint so the new role can be saved.
--
-- Apply to prod: YES (required before any Super Waiter can be created).
-- Safe & idempotent: drops and re-adds the named constraint.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD  CONSTRAINT users_role_check CHECK (role IN
  ('admin','cashier','waiter','swaiter','kitchen','hr','juice','staff','accounting','manager','supervisor'));

-- employees.role only has the employees_no_admin CHECK (role <> 'admin'),
-- which 'swaiter' already satisfies, so no change is required there.
