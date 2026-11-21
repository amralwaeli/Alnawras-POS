-- ============================================================
-- 0037_shared_printers.sql   (2026-11-21)
--
-- Printer settings are kept per branch in the database (they were saved only on
-- each tablet), so a new or reset device picks them up. Each device keeps a local
-- copy for printing offline. Adds the paper width (58 / 80 mm) that sets the size
-- of the printed image (Arabic is printed as an image).
--
-- The printers table already exists in production (made by hand, same columns);
-- CREATE TABLE IF NOT EXISTS brings fresh installs and the tests to the same state.
-- Additive. Apply BEFORE deploying the matching client.
-- ============================================================

CREATE TABLE IF NOT EXISTS printers (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL,
  ip_address TEXT,
  port       INT,
  usb_path   TEXT,
  stations   TEXT[] DEFAULT '{}'::text[],
  is_active  BOOLEAN DEFAULT true,
  branch_id  TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE printers ADD COLUMN IF NOT EXISTS paper_width INT NOT NULL DEFAULT 80;
DO $$ BEGIN
  ALTER TABLE printers ADD CONSTRAINT printers_paper_width_check CHECK (paper_width IN (58, 80));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE printers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS branch_isolation ON printers;
CREATE POLICY branch_isolation ON printers FOR ALL TO authenticated
  USING (branch_id = (SELECT public.current_device_branch()))
  WITH CHECK (branch_id = (SELECT public.current_device_branch()));
REVOKE ALL ON printers FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON printers TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ROLLBACK (manual): ALTER TABLE printers DROP COLUMN IF EXISTS paper_width;
