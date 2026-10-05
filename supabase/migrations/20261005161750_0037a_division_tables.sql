-- Applied to production 2026-10-05 as part of the 0037 expand step (split so each piece
-- applied on its own; see 20261005170000_0037d_0041_formats_expand.sql for the rest).

create table public.vsyc_divisions (
  code            text primary key check (code ~ '^[A-Za-z0-9_-]{1,20}$'),
  name            text not null,
  scoring_format  text not null check (scoring_format in ('freestyle', 'manual')),
  tech_cap        numeric(7,2),
  eval_cap        numeric(5,2),
  allow_negative  boolean not null default false,
  stop_points     numeric(5,2) not null default 0,
  discard_points  numeric(5,2) not null default 0,
  detach_points   numeric(5,2) not null default 0,
  manual_max      numeric(7,2),
  has_music       boolean not null default true,
  sort_order      integer not null default 0,
  updated_at      timestamptz not null default now(),
  constraint vsyc_divisions_format_fields check (
    (scoring_format = 'freestyle' and tech_cap > 0 and eval_cap > 0)
    or (scoring_format = 'manual' and manual_max > 0)
  )
);

create table public.vsyc_division_styles (
  division_code  text not null references public.vsyc_divisions (code) on update cascade on delete cascade,
  code           text not null check (code ~ '^[A-Za-z0-9_-]{1,20}$'),
  label          text not null,
  multiplier     numeric(5,3) not null default 1 check (multiplier > 0),
  sort_order     integer not null default 0,
  primary key (division_code, code)
);

alter table public.vsyc_divisions enable row level security;
alter table public.vsyc_division_styles enable row level security;
create policy public_can_view_divisions on public.vsyc_divisions for select to anon, authenticated using (true);
create policy service_role_all_divisions on public.vsyc_divisions using (auth.role() = 'service_role');
create policy public_can_view_division_styles on public.vsyc_division_styles for select to anon, authenticated using (true);
create policy service_role_all_division_styles on public.vsyc_division_styles using (auth.role() = 'service_role');

insert into public.vsyc_divisions
  (code, name, scoring_format, tech_cap, eval_cap, allow_negative, stop_points, discard_points, detach_points, manual_max, has_music, sort_order)
values
  ('1A', '1A — Single String', 'freestyle', 60, 10, true, 1, 3, 5, null, true, 1),
  ('X', 'X Division', 'freestyle', 60, 10, true, 1, 3, 5, null, true, 2),
  ('SBJ', 'Sport / Beginner / Junior', 'freestyle', 20, 20, false, 0, 0, 0, null, true, 3);

insert into public.vsyc_division_styles (division_code, code, label, multiplier, sort_order)
values
  ('X', '2A', '2A — Looping', 1.4, 1),
  ('X', '3A', '3A — Two-Handed String', 1.5, 2),
  ('X', '4A', '4A — Offstring', 1.3, 3),
  ('X', '5A', '5A — Freehand', 1.6, 4);

-- A division or style still used by a registration can't be deleted or renamed away.
create function public.vsyc_protect_used_divisions() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'vsyc_divisions' then
    if (tg_op = 'DELETE' or new.code <> old.code)
       and exists (select 1 from public.vsyc_registrations r where old.code = any (r.divisions::text[])) then
      raise exception 'Division % is used by registrations; remove it from them first', old.code using errcode = '23503';
    end if;
  else
    if (tg_op = 'DELETE' or new.code <> old.code)
       and exists (select 1 from public.vsyc_registrations r
                    where r.division_styles -> old.division_code ? old.code) then
      raise exception 'Style %/% is used by registrations', old.division_code, old.code using errcode = '23503';
    end if;
  end if;
  return coalesce(new, old);
end $$;

create trigger vsyc_divisions_protect before update or delete on public.vsyc_divisions
  for each row execute function public.vsyc_protect_used_divisions();
create trigger vsyc_division_styles_protect before update or delete on public.vsyc_division_styles
  for each row execute function public.vsyc_protect_used_divisions();

