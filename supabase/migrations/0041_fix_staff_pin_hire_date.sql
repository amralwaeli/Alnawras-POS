-- 0041: staff PIN sign-in failed for every PIN on the live project with
-- "structure of query does not match function result type": there users.hire_date
-- is timestamptz (schema drift from before 0001), while verify_staff_pin returns
-- hire_date DATE. Cast it, which is correct for either column type. Same
-- signature, so CREATE OR REPLACE keeps the existing grants.

CREATE OR REPLACE FUNCTION public.verify_staff_pin(p_pin text, p_device text DEFAULT NULL::text)
 RETURNS TABLE(id text, name text, employment_number text, role text, email text, status text, branch_id text, created_at timestamp with time zone, hire_date date, hourly_rate numeric, job_role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_login  TEXT := auth.uid()::text;
  v_device TEXT;
  v_branch TEXT := public.current_device_branch();
BEGIN
  IF v_login IS NULL OR v_branch IS NULL THEN
    RAISE EXCEPTION 'This device is not signed in to a branch. Ask an admin to sign it in.';
  END IF;
  v_device := v_login || ':' || left(COALESCE(p_device, '?'), 64);
  PERFORM pg_advisory_xact_lock(hashtext('pinlogin:' || v_login));   -- count + insert as one step

  DELETE FROM pin_attempts WHERE attempted_at < NOW() - interval '1 hour';
  IF (SELECT COUNT(*) FROM pin_attempts WHERE device_uid = v_device
        AND attempted_at > NOW() - interval '1 minute') >= 5 THEN
    RAISE EXCEPTION 'Too many wrong PINs on this terminal. Please wait a minute and try again.';
  END IF;
  IF (SELECT COUNT(*) FROM pin_attempts WHERE device_uid LIKE v_login || ':%'
        AND attempted_at > NOW() - interval '1 minute') >= 30 THEN
    RAISE EXCEPTION 'Too many wrong PINs at this branch. Please wait a minute and try again.';
  END IF;

  RETURN QUERY
    SELECT u.id, u.name, u.employment_number, u.role, u.email, u.status,
           u.branch_id, u.created_at, u.hire_date::date, u.hourly_rate::numeric, u.job_role
    FROM users u
    WHERE u.branch_id = v_branch AND u.status = 'active'
      AND u.pin_hash IS NOT NULL AND u.pin_hash = extensions.crypt(p_pin, u.pin_hash)
    LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO pin_attempts(device_uid) VALUES (v_device);
  END IF;
END;
$function$;
