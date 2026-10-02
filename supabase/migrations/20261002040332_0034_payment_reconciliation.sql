-- 0034: payment reconciliation and duplicate-payment flags
--
-- VSYC-26 saw a double payment and missing confirmations. Causes:
--   * /api/checkout created a new Stripe Checkout Session on every click, so
--     two tabs (or paying again while the confirm page still said "unpaid"
--     because the webhook hadn't landed yet) could both be paid.
--   * The webhook's update matched only unpaid registrations, so a second
--     payment matched nothing and left no record anywhere in the app.
--
-- This adds:
--   * checkout_created_at, so the reconcile sweep knows when a checkout is
--     recent enough to check against Stripe.
--   * vsyc_stripe_events: every webhook event received (an inbox), so
--     "did Stripe ever tell us?" has an answer.
--   * vsyc_payment_flags: payments that need a human decision. Duplicates are
--     flagged here and emailed to the organizer, never auto-refunded.
--
-- All service-role only, like every table since 0032.

ALTER TABLE public.vsyc_registrations
  ADD COLUMN IF NOT EXISTS checkout_created_at timestamptz;

CREATE TABLE IF NOT EXISTS public.vsyc_stripe_events (
  id               text        PRIMARY KEY,           -- Stripe event id (evt_...)
  type             text        NOT NULL,
  received_at      timestamptz NOT NULL DEFAULT now(),
  processed_at     timestamptz,
  attempts         int         NOT NULL DEFAULT 1,
  last_error       text
);

ALTER TABLE public.vsyc_stripe_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vsyc_stripe_events_no_direct_access" ON public.vsyc_stripe_events FOR ALL USING (false);
REVOKE ALL ON public.vsyc_stripe_events FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.vsyc_payment_flags (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                text        NOT NULL DEFAULT 'duplicate_payment',
  registration_id     uuid        REFERENCES public.vsyc_registrations(id) ON DELETE SET NULL,
  -- One flag per extra payment, however many paths notice it.
  payment_intent_id   text        UNIQUE,
  checkout_session_id text,
  amount_cents        int,
  currency            text,
  detected_by         text        NOT NULL,  -- webhook | confirm_page | checkout | reconcile
  status              text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  note                text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  resolved_at         timestamptz
);

CREATE INDEX IF NOT EXISTS vsyc_payment_flags_open_idx
  ON public.vsyc_payment_flags (created_at) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS vsyc_payment_flags_registration_idx
  ON public.vsyc_payment_flags (registration_id);

ALTER TABLE public.vsyc_payment_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vsyc_payment_flags_no_direct_access" ON public.vsyc_payment_flags FOR ALL USING (false);
REVOKE ALL ON public.vsyc_payment_flags FROM anon, authenticated;
