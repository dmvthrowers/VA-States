-- Add percent-based discount support to comp codes, and retire the initial
-- placeholder codes now that admins create codes from the /admin-dashboard
-- Comp Codes tab instead of via SQL insert.

alter table vsyc_comp_codes
  add column discount_percent smallint not null default 100
  check (discount_percent between 1 and 100);

comment on column vsyc_comp_codes.discount_percent is
  'Percent off the registration fee when this code is applied (1-100). 100 = fully comped ($0 due, skips Stripe checkout). Anything less still goes through Stripe for the discounted amount.';

-- Retire the initial seeded codes (VOLUNTEER26, SPONSOR26, FRESHLY_DIRTY_TEAM).
-- Confirmed uses_count = 0 for all three as of 2026-07-06 — safe to delete
-- outright (no registrations reference them via the comp_code FK).
delete from vsyc_comp_codes
where code in ('VOLUNTEER26', 'SPONSOR26', 'FRESHLY_DIRTY_TEAM');
