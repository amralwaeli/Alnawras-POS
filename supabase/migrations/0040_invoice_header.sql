-- 0040: each restaurant's own invoice / quotation header.
-- Invoices used to print one restaurant's name, address and logo for everyone.
-- Now the "From" lines and the logo live in the branch's settings, like pay_to.

ALTER TABLE public.branch_settings
  ADD COLUMN IF NOT EXISTS invoice_from TEXT,
  ADD COLUMN IF NOT EXISTS logo_url     TEXT;

-- The logo is shown as an image on printed documents: only https addresses, kept short.
ALTER TABLE public.branch_settings DROP CONSTRAINT IF EXISTS branch_settings_logo_url_https;
ALTER TABLE public.branch_settings ADD CONSTRAINT branch_settings_logo_url_https
  CHECK (logo_url IS NULL OR (logo_url ~ '^https://' AND length(logo_url) <= 500));
ALTER TABLE public.branch_settings DROP CONSTRAINT IF EXISTS branch_settings_invoice_from_len;
ALTER TABLE public.branch_settings ADD CONSTRAINT branch_settings_invoice_from_len
  CHECK (invoice_from IS NULL OR length(invoice_from) <= 1000);
