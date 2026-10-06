-- 0047: home-state eligibility for the state champion (site issue #82)
--
-- Residency is decided by home address. Registration now collects a home street address and ZIP and a
-- "I live in Virginia at this address" confirmation (asked of anyone entering Virginia as their state),
-- and an organizer can override the result either way. Purely additive.
--
--   home_address / home_zip   private: never selected by a public view; admin screens only.
--   home_state_confirmed      the registrant's confirmation.
--   home_state_override       null = automatic; true/false = an organizer's decision.
--
-- Backfill: people who registered before this existed entered state = 'VA' as their home state, so
-- those rows count as confirmed. That keeps the 2026 results (champion = best finisher whose state is
-- VA) exactly as they were.

alter table public.vsyc_registrations
  add column home_address         text check (home_address is null or length(home_address) <= 200),
  add column home_zip             text check (home_zip is null or home_zip ~ '^\d{5}(-\d{4})?$'),
  add column home_state_confirmed boolean not null default false,
  add column home_state_override  boolean;

update public.vsyc_registrations
   set home_state_confirmed = true
 where upper(state) = 'VA';
