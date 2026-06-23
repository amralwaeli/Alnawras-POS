-- ============================================================
-- 0010_product_images.sql
--
-- Adds a public Storage bucket for product (menu item) images.
-- Staff upload one photo per product from Product Management; the
-- returned public URL is stored in products.image (existing TEXT
-- column) and rendered on the customer menu / ordering screens.
--
-- Mirrors the open-RLS posture of 0007 (pickup-receipts / merchant-qr):
-- public read, open writes (tighten later if auth is added).
-- ============================================================

-- 1. Public bucket for product images.
INSERT INTO storage.buckets (id, name, public)
  VALUES ('product-images','product-images', true)
  ON CONFLICT (id) DO NOTHING;

-- 2. RLS policies: anyone may upload/replace/remove and read product images.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'product_images_insert') THEN
    CREATE POLICY "product_images_insert" ON storage.objects
      FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'product-images');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'product_images_update') THEN
    CREATE POLICY "product_images_update" ON storage.objects
      FOR UPDATE TO anon, authenticated USING (bucket_id = 'product-images');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'product_images_delete') THEN
    CREATE POLICY "product_images_delete" ON storage.objects
      FOR DELETE TO anon, authenticated USING (bucket_id = 'product-images');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'product_images_read') THEN
    CREATE POLICY "product_images_read" ON storage.objects
      FOR SELECT TO anon, authenticated USING (bucket_id = 'product-images');
  END IF;
END $$;

-- Reload PostgREST schema cache.
NOTIFY pgrst, 'reload schema';
