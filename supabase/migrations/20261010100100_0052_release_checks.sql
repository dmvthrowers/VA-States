-- 0052 Release gates (master plan T2): the head judge's "checked" on one round's scores.
-- fingerprint is "<score count>:<score sum>" at the moment of the check; if a score changes afterwards the
-- fingerprint no longer matches and the gate reopens. ADDITIVE: a new table. Nothing reads it until the release-gate
-- code is ported (build plan 4.7) and dayOf.releaseGates is turned on. Same change as the template's 0052.
-- Safe to run twice.

create table if not exists public.vsyc_release_checks (
  division     text not null references public.vsyc_divisions (code) on update cascade on delete cascade,
  round        smallint not null default 1 check (round between 1 and 5),
  checked_by   text,
  checked_at   timestamptz not null default now(),
  fingerprint  text not null,
  primary key (division, round)
);

alter table public.vsyc_release_checks enable row level security;
drop policy if exists service_role_all_release_checks on public.vsyc_release_checks;
create policy service_role_all_release_checks on public.vsyc_release_checks using (auth.role() = 'service_role');
