-- 0033: email outbox
--
-- Every email the app sends is written here first, then sent. Before this,
-- confirmation emails were fire-and-forget with a 2.5s wait: if Resend was
-- slow or the daily cap was hit, the registrant never got their
-- confirmation and nothing recorded that it was lost.
--
-- Resend's free tier allows 100 emails per UTC day (shared with the YoYo Map
-- app on the same Resend account; inbound mail counts too) and 10 requests
-- per second. The app keeps its own budget under that (see lib/email-policy.ts)
-- and records Resend's account-wide count from each response in
-- email_daily_usage.
--
-- Rows are service-role only, like every table since 0032.

CREATE TABLE IF NOT EXISTS public.email_outbox (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template    text        NOT NULL,
  to_email    text        NOT NULL,
  payload     jsonb       NOT NULL,
  -- 0 = someone is waiting on it, 1 = admin alert, 2 = bulk
  priority    smallint    NOT NULL DEFAULT 0,
  -- Same key twice (a webhook replay, a double submit) is stored once.
  dedupe_key  text        UNIQUE,
  not_before  timestamptz NOT NULL DEFAULT now(),
  attempts    int         NOT NULL DEFAULT 0,
  last_error  text,
  claimed_at  timestamptz,
  sent_at     timestamptz,
  dead_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_outbox_drain_idx
  ON public.email_outbox (priority, not_before)
  WHERE sent_at IS NULL AND dead_at IS NULL;

ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_outbox_no_direct_access" ON public.email_outbox FOR ALL USING (false);
REVOKE ALL ON public.email_outbox FROM anon, authenticated;

-- Claim up to p_limit due rows for one drain run. FOR UPDATE SKIP LOCKED means
-- two drains running at once never get the same row. A claim older than
-- 5 minutes is treated as abandoned (the function holding it timed out).
CREATE OR REPLACE FUNCTION public.claim_email_outbox(p_limit int)
RETURNS SETOF public.email_outbox
LANGUAGE sql
SET search_path = ''
AS $$
  UPDATE public.email_outbox o
     SET claimed_at = now()
   WHERE o.id IN (
     SELECT id
       FROM public.email_outbox
      WHERE sent_at IS NULL
        AND dead_at IS NULL
        AND not_before <= now()
        AND (claimed_at IS NULL OR claimed_at < now() - interval '5 minutes')
      ORDER BY priority, not_before
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
   )
  RETURNING o.*;
$$;

REVOKE ALL ON FUNCTION public.claim_email_outbox(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_outbox(int) TO service_role;

-- Emails used per UTC day (Resend's quota window), account-wide when known.
CREATE TABLE IF NOT EXISTS public.email_daily_usage (
  day  date PRIMARY KEY,
  sent int  NOT NULL DEFAULT 0
);

ALTER TABLE public.email_daily_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_daily_usage_no_direct_access" ON public.email_daily_usage FOR ALL USING (false);
REVOKE ALL ON public.email_daily_usage FROM anon, authenticated;

-- Add p_count to today's total (used when Resend didn't report its count).
CREATE OR REPLACE FUNCTION public.record_email_send(p_count int DEFAULT 1)
RETURNS int
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO public.email_daily_usage AS u (day, sent)
  VALUES ((now() AT TIME ZONE 'utc')::date, p_count)
  ON CONFLICT (day) DO UPDATE SET sent = u.sent + EXCLUDED.sent
  RETURNING u.sent;
$$;

-- Raise today's total to Resend's account-wide count, never lower it.
CREATE OR REPLACE FUNCTION public.observe_email_usage(p_used int)
RETURNS int
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO public.email_daily_usage AS u (day, sent)
  VALUES ((now() AT TIME ZONE 'utc')::date, p_used)
  ON CONFLICT (day) DO UPDATE SET sent = GREATEST(u.sent, EXCLUDED.sent)
  RETURNING u.sent;
$$;

REVOKE ALL ON FUNCTION public.record_email_send(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.observe_email_usage(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_email_send(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.observe_email_usage(int) TO service_role;
