-- 0032: the public anon key must not read registrant data
--
-- Every public table had the default Supabase grants (anon and authenticated
-- could SELECT/INSERT/UPDATE/DELETE every column), so RLS was the only gate.
-- Four "public_can_view_*" SELECT policies open rows to anon:
--   vsyc_registrations (paid AND is_public), vsyc_spectators (is_public),
--   vsyc_staff_accounts (is_active AND is_public_profile), vsyc_event_flags.
-- Because the grants covered every column, anyone holding the anon key (it
-- ships in the browser bundle) could run
--   GET /rest/v1/vsyc_registrations?select=email,phone,parent_email,...
-- and read email, phone, emergency contacts, parent details, IP address,
-- admin notes and music upload tokens for every public competitor, including
-- minors, plus spectator emails and IPs.
--
-- The app never reads these tables with the anon or authenticated role:
-- every query goes through createAdminClient() (service role, bypasses RLS
-- and grants), and the browser client is used for auth only. So drop all
-- table and view privileges for anon and authenticated. The RLS policies stay
-- in place as a second layer.

DO $$
DECLARE
  obj record;
BEGIN
  FOR obj IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm', 'p')
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', obj.relname);
  END LOOP;
END $$;

-- Tables created by the postgres role in later migrations start closed too;
-- grant anon access explicitly if a table is ever meant to be public.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
