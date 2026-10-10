-- 0053 Published draws (master plan P4): how each saved run order was made. One row per save, newest wins.
--   random: seed + the submitted order; anyone can re-run the draw and get the same order.
--   rule:   the written-out rule (for example "Reverse rank from the previous round").
--   manual: a hand edit, with the reason.
-- ADDITIVE: a new table. Same change as the template's 0053. The routes that write it are ported in build plan 4.8.
-- Safe to run twice.

create table if not exists public.vsyc_run_order_draws (
  id          uuid primary key default gen_random_uuid(),
  division    text not null references public.vsyc_divisions (code) on update cascade on delete cascade,
  round       smallint not null default 1 check (round between 1 and 5),
  method      text not null check (method in ('random', 'rule', 'manual')),
  seed        text check (seed is null or seed ~ '^[a-z0-9-]{4,64}$'),
  rule        text check (rule is null or length(rule) <= 200),
  reason      text check (reason is null or length(reason) <= 300),
  order_ids   uuid[] not null,
  made_by     text,
  created_at  timestamptz not null default now(),
  check (method <> 'random' or seed is not null)
);

create index if not exists vsyc_run_order_draws_round_idx on public.vsyc_run_order_draws (division, round, created_at desc);

alter table public.vsyc_run_order_draws enable row level security;
drop policy if exists service_role_all_run_order_draws on public.vsyc_run_order_draws;
create policy service_role_all_run_order_draws on public.vsyc_run_order_draws using (auth.role() = 'service_role');
