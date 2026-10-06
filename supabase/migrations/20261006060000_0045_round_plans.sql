-- 0045: confirmed round plans (site issue #80)
--
-- A division with a `roundPlan` in contest.config.ts runs different rounds depending on how many
-- entered (e.g. 25 or fewer: final only; 26-50: prelims then final; more: prelims, semi-final,
-- final). When registration closes the app suggests a plan from the paid entrant count and an
-- organizer confirms it here. Until a division has a row, every configured round counts, so
-- this is purely additive and changes nothing for divisions without a plan.
--
-- `rounds` is the confirmed plan: [{ "round": 1, "key": "prelims", "advance": 15 }, ...].
-- Round numbers are positions in the division's configured rounds; skipped rounds keep theirs.

create table public.vsyc_round_plans (
  division      text primary key references public.vsyc_divisions (code) on update cascade on delete cascade,
  entrants      integer not null check (entrants >= 0),
  tier          integer not null check (tier >= 0),
  rounds        jsonb not null check (jsonb_typeof(rounds) = 'array' and jsonb_array_length(rounds) between 1 and 5),
  confirmed_by  text,
  confirmed_at  timestamptz not null default now()
);

alter table public.vsyc_round_plans enable row level security;
create policy service_role_all_round_plans on public.vsyc_round_plans using (auth.role() = 'service_role');
