-- ============================================================
-- 0007_pickup_orders.sql
--
-- Adds the "Pickup Order" feature: secure single-use customer links,
-- pickup-specific order fields, online-payment verification states,
-- and an audit log. Pickup orders are normal `orders` rows
-- (order_type = 'pickup') so they flow through the existing cashier,
-- kitchen, dashboard, reporting and accounting logic unchanged.
--
-- Run in the Supabase SQL Editor.
-- ============================================================

-- 1. orders.order_type — allow 'pickup'
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_type_check;
ALTER TABLE orders ADD  CONSTRAINT orders_order_type_check
  CHECK (order_type IN ('dine-in','takeaway','pickup'));

-- 2. orders.payment_status — allow online-payment verification states
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE orders ADD  CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('unpaid','paid','pending_verification','rejected'));

-- 3. Pickup-specific columns on orders (all nullable; only used by pickup orders)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS pickup_method      TEXT,   -- 'grab' | 'lalamove' | 'self'
  ADD COLUMN IF NOT EXISTS pickup_status      TEXT,   -- 'preparing' | 'ready' | 'picked'
  ADD COLUMN IF NOT EXISTS pickup_pay_type    TEXT,   -- 'cash' | 'online'
  ADD COLUMN IF NOT EXISTS customer_name      TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone     TEXT,
  ADD COLUMN IF NOT EXISTS customer_email     TEXT,
  ADD COLUMN IF NOT EXISTS payment_receipt_url TEXT;

-- 4. Secure pickup link tokens (one per created pickup order)
CREATE TABLE IF NOT EXISTS pickup_tokens (
  id             TEXT PRIMARY KEY,
  token          TEXT UNIQUE NOT NULL,
  branch_id      TEXT NOT NULL,
  created_by     TEXT,
  created_by_name TEXT,
  order_id       TEXT REFERENCES orders(id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'new'
                   CHECK (status IN ('new','ordered','completed','expired')),
  active         BOOLEAN NOT NULL DEFAULT true,
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pickup_tokens_token ON pickup_tokens(token);
CREATE INDEX IF NOT EXISTS idx_pickup_tokens_branch ON pickup_tokens(branch_id);

-- 5. Audit log (full audit trail for pickup lifecycle + payment decisions)
CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  action      TEXT NOT NULL,          -- e.g. 'pickup.link_created', 'pickup.order_submitted'
  entity      TEXT,                   -- e.g. 'pickup_token', 'order'
  entity_id   TEXT,
  user_id     TEXT,
  user_name   TEXT,
  branch_id   TEXT,
  details     JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_branch ON audit_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity, entity_id);

-- 6. Storage buckets for payment receipts and the merchant payment QR.
--    Public read so the customer page and staff can display them; writes are
--    open (matches the project's current open-RLS posture — tighten later).
INSERT INTO storage.buckets (id, name, public)
  VALUES ('pickup-receipts','pickup-receipts', true)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public)
  VALUES ('merchant-qr','merchant-qr', true)
  ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  -- pickup-receipts: anyone can upload a receipt and read it back
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pickup_receipts_insert') THEN
    CREATE POLICY "pickup_receipts_insert" ON storage.objects
      FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'pickup-receipts');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pickup_receipts_read') THEN
    CREATE POLICY "pickup_receipts_read" ON storage.objects
      FOR SELECT TO anon, authenticated USING (bucket_id = 'pickup-receipts');
  END IF;
  -- merchant-qr: staff upload, everyone reads
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'merchant_qr_write') THEN
    CREATE POLICY "merchant_qr_write" ON storage.objects
      FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'merchant-qr');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'merchant_qr_update') THEN
    CREATE POLICY "merchant_qr_update" ON storage.objects
      FOR UPDATE TO anon, authenticated USING (bucket_id = 'merchant-qr');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'merchant_qr_read') THEN
    CREATE POLICY "merchant_qr_read" ON storage.objects
      FOR SELECT TO anon, authenticated USING (bucket_id = 'merchant-qr');
  END IF;
END $$;

-- Reload PostgREST schema cache so the new columns/tables are visible.
NOTIFY pgrst, 'reload schema';
