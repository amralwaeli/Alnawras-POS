-- 0045: one-time-purchase customers on their own Supabase project.
--
-- smartpos_license   On a CUSTOMER's project: the licence the main server signed for
--                    that project (written by the setup function with the service
--                    key). Readable by anyone: it is not secret, only signed.
-- onetime_tenants    On the MAIN project: the register of one-time customers. Only
--                    the super-admin can read it; the setup function writes it.
-- find_server(email) On the MAIN project: which server a branch email belongs to, so
--                    a device signs in to the right project without a setup code.
--                    Returns only the project address and its public (anon) key.

CREATE TABLE IF NOT EXISTS public.smartpos_license (
  id         boolean PRIMARY KEY DEFAULT true CHECK (id),   -- one row
  payload    text NOT NULL,
  sig        text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.smartpos_license ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS smartpos_license_read ON public.smartpos_license;
CREATE POLICY smartpos_license_read ON public.smartpos_license FOR SELECT TO anon, authenticated USING (true);
REVOKE ALL ON public.smartpos_license FROM anon, authenticated;
GRANT SELECT ON public.smartpos_license TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.onetime_tenants (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  email       text NOT NULL UNIQUE CHECK (email = lower(email)),
  project_ref text NOT NULL UNIQUE CHECK (project_ref ~ '^[a-z0-9]{20}$'),
  project_url text NOT NULL CHECK (project_url ~ '^https://[a-z0-9]{20}\.supabase\.co$'),
  anon_key    text NOT NULL,
  license     jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.onetime_tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS onetime_tenants_super_admin ON public.onetime_tenants;
CREATE POLICY onetime_tenants_super_admin ON public.onetime_tenants FOR SELECT TO authenticated
  USING (public.is_current_user_super_admin());
REVOKE ALL ON public.onetime_tenants FROM anon, authenticated;
GRANT SELECT ON public.onetime_tenants TO authenticated;

CREATE OR REPLACE FUNCTION public.find_server(p_email text)
RETURNS TABLE (project_url text, anon_key text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.project_url, t.anon_key FROM public.onetime_tenants t
   WHERE t.email = lower(btrim(p_email)) LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.find_server(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_server(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
