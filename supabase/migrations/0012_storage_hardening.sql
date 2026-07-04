-- ============================================================
-- 0012_storage_hardening.sql
--
-- Hardens the three public Storage buckets (product-images, merchant-qr,
-- pickup-receipts) WITHOUT introducing auth (that is Phase 1). It:
--   1. Enforces file TYPE + SIZE at the bucket level. The Storage API applies
--      these server-side on every upload regardless of the client, so arbitrary
--      / oversized / non-image (e.g. HTML/SVG/JS) uploads are rejected.
--   2. Removes anon UPDATE/DELETE so existing objects (menu photos, the payment
--      QR) can no longer be overwritten or deleted with the public anon key —
--      closing the menu-defacement and payment-QR-overwrite (fraud) paths.
--   3. Keeps anon INSERT + public SELECT, because the app currently writes as
--      the anon role and the menu / receipts / QR must remain publicly readable.
--      Phase 1 (Supabase Auth + RLS) will tighten INSERT to authenticated staff.
--
-- SAFE & REVERSIBLE: no object data is touched; limits only affect NEW uploads;
-- dropped policies can be recreated. Idempotent (DROP IF EXISTS / UPDATE).
--
-- OPERATIONAL NOTE: after this runs, the payment QR can no longer be REPLACED
-- from the app (overwrite is blocked). First-time upload still works; to replace
-- an existing QR, remove the old object in the Supabase Storage dashboard first
-- (an authenticated action). Phase 1 restores in-app replace for staff only.
-- ============================================================

-- 1. Server-enforced type + size limits per bucket.
UPDATE storage.buckets
  SET file_size_limit    = 5242880,  -- 5 MB
      allowed_mime_types = ARRAY['image/png','image/jpeg','image/jpg','image/webp']
  WHERE id IN ('product-images', 'merchant-qr');

UPDATE storage.buckets
  SET file_size_limit    = 15728640, -- 15 MB (receipts may be full-res phone photos or PDFs)
      allowed_mime_types = ARRAY['image/png','image/jpeg','image/jpg','image/webp','application/pdf']
  WHERE id = 'pickup-receipts';

-- 2. product-images: no overwrite / delete of existing menu photos.
DROP POLICY IF EXISTS "product_images_update" ON storage.objects;
DROP POLICY IF EXISTS "product_images_delete" ON storage.objects;

-- 3. merchant-qr: lock against overwrite / delete (close the payment-QR fraud path).
DROP POLICY IF EXISTS "merchant_qr_update" ON storage.objects;
DROP POLICY IF EXISTS "merchant_qr_delete" ON storage.objects;

-- pickup-receipts already had only INSERT + SELECT for anon — nothing to drop.

NOTIFY pgrst, 'reload schema';
