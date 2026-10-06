-- 0042 (contract): run ONLY after the formats code (PRs #54–#56) serves production.
--
-- Drops what the expand migrations (0037, 0039) kept for the old app: x_substyle, its sync
-- trigger, the old enum types, and the old per-division unique keys on scores and run order.
-- The round-aware unique keys added in 0037d_0041 replace those keys. X still needs at least
-- one style, now checked on division_styles.

begin;
set local lock_timeout = '10s';

drop trigger if exists vsyc_registrations_0_sync_x_substyle on public.vsyc_registrations;
drop function if exists public.vsyc_sync_x_substyle();
alter table public.vsyc_registrations drop constraint if exists x_requires_substyle;
alter table public.vsyc_registrations drop column if exists x_substyle;
drop type if exists public.x_substyle;
drop type if exists public.division_code;
alter table public.vsyc_registrations
  add constraint x_requires_style check (not ('X' = any (divisions)) or division_styles ? 'X');

alter table public.vsyc_scores drop constraint if exists vsyc_scores_registration_id_division_judge_name_key;
alter table public.vsyc_scores drop constraint if exists uq_vsyc_scores_judge_user;
alter table public.vsyc_run_order drop constraint if exists vsyc_run_order_division_position_key;
alter table public.vsyc_run_order drop constraint if exists vsyc_run_order_division_registration_id_key;

commit;
