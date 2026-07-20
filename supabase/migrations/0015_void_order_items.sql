-- ============================================================
-- 0015_void_order_items.sql
--
-- Lets an authorized staff member void a single item that's already been
-- sent to the kitchen (e.g. the guest changed their mind, or it was a
-- mis-order). The kitchen needs to see it was cancelled, not just have it
-- silently vanish, and the cancellation needs an audit trail (who / when /
-- why) since it removes money from an otherwise-already-fired ticket.
-- ============================================================

ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_status_check;
ALTER TABLE order_items ADD CONSTRAINT order_items_status_check
  CHECK (status IN ('pending','preparing','ready','served','cancelled'));

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS cancelled_by      TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by_name TEXT,
  ADD COLUMN IF NOT EXISTS cancel_reason      TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at        TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
