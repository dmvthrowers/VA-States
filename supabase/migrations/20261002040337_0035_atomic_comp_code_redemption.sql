-- 0035: redeem comp codes atomically
--
-- /api/register checked a code, inserted the registration, then read
-- uses_count and wrote uses_count + 1. Two registrations using the same code
-- at once could both pass the check (going past max_uses), and one of the two
-- increments could be lost.
--
-- redeem_comp_code() claims one use in a single UPDATE that only succeeds
-- while the code is active, unexpired and under max_uses. The route calls it
-- before inserting the registration and calls release_comp_code() if the
-- insert fails, so a failed registration doesn't use up the code.

CREATE OR REPLACE FUNCTION public.redeem_comp_code(p_code text)
RETURNS int  -- discount_percent, or NULL when the code can't be used
LANGUAGE sql
SET search_path = ''
AS $$
  UPDATE public.vsyc_comp_codes
     SET uses_count = uses_count + 1
   WHERE code = p_code
     AND active
     AND uses_count < max_uses
     AND expires_at >= now()
  RETURNING discount_percent;
$$;

CREATE OR REPLACE FUNCTION public.release_comp_code(p_code text)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  UPDATE public.vsyc_comp_codes
     SET uses_count = uses_count - 1
   WHERE code = p_code
     AND uses_count > 0;
$$;

REVOKE ALL ON FUNCTION public.redeem_comp_code(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_comp_code(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_comp_code(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_comp_code(text) TO service_role;
