-- ─────────────────────────────────────────────────────────────────────────────
-- VSYC-26 Online Payment: Stripe Checkout
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add 'stripe' to the payment_method enum (safe to re-run)
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'stripe';

-- 2. Stripe reference columns on registrations
ALTER TABLE vsyc_registrations
  ADD COLUMN IF NOT EXISTS checkout_session_id text,
  ADD COLUMN IF NOT EXISTS payment_intent_id   text,
  ADD COLUMN IF NOT EXISTS amount_paid_cents   int,
  ADD COLUMN IF NOT EXISTS paid_currency       text;

-- 3. Look up a registration fast from a webhook by its Stripe session
CREATE INDEX IF NOT EXISTS idx_vsyc_checkout_session
  ON vsyc_registrations (checkout_session_id);

CREATE INDEX IF NOT EXISTS idx_vsyc_payment_intent
  ON vsyc_registrations (payment_intent_id);
