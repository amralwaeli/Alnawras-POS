-- 0051: menu layout. The admin places each item in a row of its category (e.g. all chicken
-- in row 1, lamb in row 2) and in a place in that row; every menu screen shows those rows.
-- Existing items stay in row 0 in name order, which is how menus looked before.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS menu_row INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS menu_pos INT NOT NULL DEFAULT 0;
