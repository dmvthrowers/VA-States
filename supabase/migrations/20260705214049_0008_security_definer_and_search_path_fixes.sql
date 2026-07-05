-- Applied to prod 2026-07-05 via Supabase MCP.
-- Views should run with the querying user's privileges, not the creator's.
ALTER VIEW vsyc_results SET (security_invoker = true);
ALTER VIEW vsyc_public_profiles SET (security_invoker = true);

-- Pin the search_path on the trigger function to prevent search_path hijacking.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
