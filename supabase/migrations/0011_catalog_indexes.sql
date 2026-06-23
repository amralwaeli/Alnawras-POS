-- ============================================================
-- 0011_catalog_indexes.sql
--
-- Proactive performance: index the columns the menu queries filter on.
-- Every catalog load (staff login + every public QR/pickup scan) runs:
--   SELECT * FROM products   WHERE branch_id = ? AND is_active = true ORDER BY name
--   SELECT * FROM categories WHERE branch_id = ?
-- Without these indexes Postgres sequentially scans the whole table on each
-- call. Cheap insurance so the menu stays fast as products and traffic grow.
--
-- Run in the Supabase SQL Editor (or `supabase db push`).
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_products_branch_active
  ON products(branch_id, is_active);

CREATE INDEX IF NOT EXISTS idx_categories_branch
  ON categories(branch_id);

NOTIFY pgrst, 'reload schema';
