-- 0046: payment flags for Stripe disputes (chargebacks)
--
-- vsyc_payment_flags already holds payments that need a human decision (duplicate payments).
-- A dispute is another one, keyed by Stripe's dispute id. Purely additive: new nullable columns
-- and a unique index on dispute_id. A dispute flag leaves payment_intent_id empty (that column is
-- unique and belongs to the duplicate-payment flow), and keeps the disputed payment intent in
-- disputed_payment_intent instead.

alter table public.vsyc_payment_flags
  add column dispute_id               text,
  add column dispute_status           text,
  add column dispute_reason           text,
  add column evidence_due_by          timestamptz,
  add column disputed_payment_intent  text;

-- Not a partial index: the webhook upserts with ON CONFLICT (dispute_id), which needs a plain unique
-- index. Rows without a dispute keep dispute_id null, and nulls never collide.
create unique index vsyc_payment_flags_dispute_id_key
  on public.vsyc_payment_flags (dispute_id);
create index vsyc_payment_flags_disputed_pi_idx
  on public.vsyc_payment_flags (disputed_payment_intent) where disputed_payment_intent is not null;
