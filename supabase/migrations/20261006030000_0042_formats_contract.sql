-- 0042 (contract): run ONLY after the formats code is deployed to production.
-- Move this file into supabase/migrations/ (or apply it with the Supabase CLI/MCP) at that point.
--
-- Drops what the expand migrations (0037, 0039) kept for the old app: x_substyle, its sync
-- trigger, the old enum types, and the old per-division unique keys on scores and run order.

drop trigger if exists vsyc_registrations_0_sync_x_substyle on public.vsyc_registrations;
drop function if exists public.vsyc_sync_x_substyle();
alter table public.vsyc_registrations drop constraint if exists x_requires_substyle;
alter table public.vsyc_registrations drop column if exists x_substyle;
drop type if exists public.x_substyle;
drop type if exists public.division_code;

alter table public.vsyc_scores drop constraint if exists vsyc_scores_registration_id_division_judge_name_key;
alter table public.vsyc_scores drop constraint if exists uq_vsyc_scores_judge_user;
alter table public.vsyc_run_order drop constraint if exists vsyc_run_order_division_position_key;
alter table public.vsyc_run_order drop constraint if exists vsyc_run_order_division_registration_id_key;
