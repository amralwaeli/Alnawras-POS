-- ============================================================
-- 0008_group_ordering.sql
--
-- Secure multi-device GROUP ordering for table QR codes.
--
--   * tables.qr_token  — a STABLE, cryptographically-random token printed in the
--     QR. It identifies the table only (never the raw UUID) and is reusable
--     forever across many dining groups.
--   * order_groups     — one ACTIVE group per table = the current dining party.
--   * guest_sessions   — one per customer device that scans; all sessions of a
--     party share the same group. Each has its own random token + UUIDv7 id.
--
-- Closing a table closes the group + all its guest sessions, which invalidates
-- every token. The next scan of the (still valid) table QR starts a fresh group.
--
-- Run in the Supabase SQL Editor.  (pgcrypto provides gen_random_bytes.)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Stable per-table QR token (identifies the table; never exposes the UUID)
ALTER TABLE tables ADD COLUMN IF NOT EXISTS qr_token TEXT UNIQUE;
UPDATE tables SET qr_token = encode(gen_random_bytes(32), 'hex') WHERE qr_token IS NULL;
CREATE INDEX IF NOT EXISTS idx_tables_qr_token ON tables(qr_token);

-- 2. Order groups — the dining party currently at a table
CREATE TABLE IF NOT EXISTS order_groups (
  id          TEXT PRIMARY KEY,                 -- UUIDv7 (generated client-side)
  table_id    TEXT NOT NULL REFERENCES tables(id),
  branch_id   TEXT NOT NULL,
  order_id    TEXT,                             -- the table's aggregate order
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  closed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_order_groups_table ON order_groups(table_id);
-- At most one ACTIVE group per table.
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_groups_active_table
  ON order_groups(table_id) WHERE status = 'active';

-- 3. Guest sessions — one per scanning device, all sharing the group
CREATE TABLE IF NOT EXISTS guest_sessions (
  id           TEXT PRIMARY KEY,                -- UUIDv7 (generated client-side)
  group_id     TEXT NOT NULL REFERENCES order_groups(id),
  table_id     TEXT NOT NULL REFERENCES tables(id),
  branch_id    TEXT NOT NULL,
  token        TEXT UNIQUE NOT NULL,            -- random 64-hex session token
  guest_label  TEXT,                            -- 'Guest 1', 'Guest 2', …
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  last_seen    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_guest_sessions_token ON guest_sessions(token);
CREATE INDEX IF NOT EXISTS idx_guest_sessions_group ON guest_sessions(group_id);

-- 4. Atomic "join the table's group": returns the single active group + its
--    single shared order, creating both on the first scan. The partial unique
--    index on order_groups serialises concurrent first-scanners so the whole
--    party always shares ONE group and ONE order (one bill to kitchen+cashier).
CREATE OR REPLACE FUNCTION join_table_group(p_table_id text, p_branch_id text, p_table_number int)
RETURNS TABLE(group_id text, order_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_group_id text;
  v_order_id text;
BEGIN
  SELECT og.id, og.order_id INTO v_group_id, v_order_id
    FROM order_groups og
    WHERE og.table_id = p_table_id AND og.status = 'active'
    LIMIT 1;

  IF v_group_id IS NULL THEN
    v_order_id := 'order-' || (extract(epoch from clock_timestamp()) * 1000)::bigint;
    v_group_id := gen_random_uuid()::text;
    INSERT INTO orders(id, table_id, table_number, status, order_type, branch_id, waiters, subtotal, tax, total)
      VALUES (v_order_id, p_table_id, COALESCE(p_table_number, 0), 'open', 'dine-in', p_branch_id, '[]'::jsonb, 0, 0, 0);
    BEGIN
      INSERT INTO order_groups(id, table_id, branch_id, order_id, status)
        VALUES (v_group_id, p_table_id, p_branch_id, v_order_id, 'active');
    EXCEPTION WHEN unique_violation THEN
      DELETE FROM orders WHERE id = v_order_id;     -- lost the race — drop our order
      SELECT og.id, og.order_id INTO v_group_id, v_order_id
        FROM order_groups og WHERE og.table_id = p_table_id AND og.status = 'active' LIMIT 1;
    END;
    UPDATE tables SET status = 'occupied', current_order_id = v_order_id WHERE id = p_table_id;
  ELSIF v_order_id IS NULL THEN
    v_order_id := 'order-' || (extract(epoch from clock_timestamp()) * 1000)::bigint;
    INSERT INTO orders(id, table_id, table_number, status, order_type, branch_id, waiters, subtotal, tax, total)
      VALUES (v_order_id, p_table_id, COALESCE(p_table_number, 0), 'open', 'dine-in', p_branch_id, '[]'::jsonb, 0, 0, 0);
    UPDATE order_groups SET order_id = v_order_id WHERE id = v_group_id;
    UPDATE tables SET status = 'occupied', current_order_id = v_order_id WHERE id = p_table_id;
  END IF;

  group_id := v_group_id;
  order_id := v_order_id;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION join_table_group(text, text, int) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
