-- Applied to production 2026-07-05 (schema_migrations version 20260705173439, name 20260607_stripe_payment_columns).
-- Copied into the repo 2026-09-23 so the repo matches prod; SQL is verbatim from
-- supabase_migrations.schema_migrations.

ALTER TABLE vsyc_registrations
  ADD COLUMN IF NOT EXISTS checkout_session_id text,
  ADD COLUMN IF NOT EXISTS payment_intent_id   text,
  ADD COLUMN IF NOT EXISTS amount_paid_cents   int,
  ADD COLUMN IF NOT EXISTS paid_currency       text;

CREATE INDEX IF NOT EXISTS idx_vsyc_checkout_session
  ON vsyc_registrations (checkout_session_id);

CREATE INDEX IF NOT EXISTS idx_vsyc_payment_intent
  ON vsyc_registrations (payment_intent_id);
