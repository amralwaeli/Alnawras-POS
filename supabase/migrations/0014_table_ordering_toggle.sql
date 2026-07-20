-- ============================================================
-- 0014_table_ordering_toggle.sql
--
-- Lets a waiter explicitly turn customer self-ordering (QR / group QR) on or
-- off per table, instead of it always being available the moment a table QR
-- is scanned. Workflow: waiter seats a party -> turns ordering ON for that
-- table -> customers can order from their phones. The moment the table's
-- bill is paid, the app flips this back to OFF automatically (see
-- TablesView.handlePaid), so the next party can't order until a waiter
-- allows it again.
--
-- Defaults to false so existing tables require an explicit opt-in from
-- staff before self-ordering starts working after this migration lands.
-- ============================================================

ALTER TABLE tables
  ADD COLUMN IF NOT EXISTS ordering_enabled BOOLEAN NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
