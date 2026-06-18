-- ============================================================
-- 0005_secure_qr_tokens.sql
--
-- Adds cryptographic token support to qr_sessions so that
-- customer-facing QR URLs never expose the real table UUID.
--
-- Changes:
--   1. Add `token` column (64-char hex, unique) to qr_sessions.
--   2. Add `expires_at` column for automatic TTL enforcement.
--   3. Add an index on `token` for fast lookups.
--   4. Add a partial index to enforce one active session per table.
--
-- Run this in the Supabase SQL Editor.
-- ============================================================

-- 1. Add token column (nullable first so existing rows don't break)
ALTER TABLE qr_sessions
  ADD COLUMN IF NOT EXISTS token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 2. Backfill existing rows with a placeholder token so the UNIQUE
--    constraint doesn't reject them. They will be replaced the next
--    time the admin regenerates a QR code.
UPDATE qr_sessions
SET token = 'legacy-' || id,
    expires_at = NOW() -- mark existing sessions as immediately expired
WHERE token IS NULL;

-- 3. Index for fast token lookups (the hot path on every QR scan)
CREATE INDEX IF NOT EXISTS idx_qr_sessions_token ON qr_sessions(token);

-- 4. Index to enforce one active session per table
CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_sessions_active_table
  ON qr_sessions(table_id)
  WHERE active = true;

-- Done. Reload PostgREST schema cache.
NOTIFY pgrst, 'reload schema';
