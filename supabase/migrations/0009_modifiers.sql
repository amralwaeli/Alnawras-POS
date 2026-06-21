-- ============================================================
-- 0009_modifiers.sql
--
-- Adds "Modifier Groups" — reusable sets of options (e.g. a "Chicken"
-- group with "Leg" / "Chest") that are linked to products. When a linked
-- product is ordered, its options are offered to the customer/staff; the
-- chosen options (and any add-on price) attach to the order line.
--
--   modifier_groups          one row per group (name + single/multiple type)
--   modifier_options         the options inside a group (name + add-on price)
--   product_modifier_groups  many-to-many: which groups apply to which products
--   order_items.modifiers    JSONB snapshot of the options chosen on a line
--
-- RLS is left open, consistent with the rest of the schema (see 0001).
-- Run in the Supabase SQL Editor (or via `supabase db push`).
-- ============================================================

-- ─── modifier_groups ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modifier_groups (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'single'
                  CHECK (type IN ('single','multiple')),
  branch_id     TEXT NOT NULL,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_modifier_groups_branch ON modifier_groups(branch_id);

-- ─── modifier_options ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modifier_options (
  id            TEXT PRIMARY KEY,
  group_id      TEXT NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  add_on_price  DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_default    BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_modifier_options_group ON modifier_options(group_id);

-- ─── product_modifier_groups (link table) ────────────────────
CREATE TABLE IF NOT EXISTS product_modifier_groups (
  product_id    TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  group_id      TEXT NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  display_order INTEGER DEFAULT 0,
  PRIMARY KEY (product_id, group_id)
);
CREATE INDEX IF NOT EXISTS idx_pmg_product ON product_modifier_groups(product_id);
CREATE INDEX IF NOT EXISTS idx_pmg_group   ON product_modifier_groups(group_id);

-- ─── order_items.modifiers ───────────────────────────────────
-- JSONB array snapshot, e.g.
--   [{ "groupId":"mg-1","groupName":"Chicken","optionId":"mo-1",
--      "optionName":"Leg","price":2.00 }]
-- A snapshot (not a FK) so historical orders stay correct even if a
-- group/option is later edited or deleted. The line's `price` already
-- includes the selected add-ons; this column is for display/breakdown.
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS modifiers JSONB DEFAULT '[]'::jsonb;

-- Reload PostgREST schema cache so the new columns/tables are visible.
NOTIFY pgrst, 'reload schema';
