-- 0043: one music track per division per player (expand step)
--
-- Until now a registration had a single music slot (vsyc_registrations.music_path / music_filename),
-- so a player in 1A + X uploaded for their first division and a second upload replaced it.
-- This adds vsyc_music: one row per (registration, division). Purely additive:
--   * the old music_* columns stay as they are and the app stops reading them. A later
--     "contract" migration drops them once this has run through a contest.
--   * vsyc_registrations.music_uploaded_at is kept up to date by a trigger as "has at least one
--     real (non lo-fi) track", so the admin list and its Music filter keep working.
--
-- Backfill: each existing track is filed under the division in its file name
-- (DIVISION_Last_First.ext), falling back to the player's first division.

create table public.vsyc_music (
  id               uuid primary key default gen_random_uuid(),
  registration_id  uuid not null references public.vsyc_registrations (id) on delete cascade,
  division         text not null references public.vsyc_divisions (code) on update cascade,
  -- Object name inside the private vsyc26-music bucket, e.g. "1A_Baus_Bryant.mp3" or "lofi/rain.mp3".
  object_name      text not null check (length(object_name) between 1 and 300 and object_name !~ '\.\.'),
  -- What staff and the player see.
  filename         text not null check (length(filename) between 1 and 200),
  size_bytes       bigint check (size_bytes is null or size_bytes >= 0),
  -- 'player' uploaded it, 'admin' uploaded or marked it for them, 'backfill' came from the old
  -- single slot, 'fallback' is a random lo-fi track assigned because the slot was empty.
  source           text not null default 'player' check (source in ('player', 'admin', 'backfill', 'fallback')),
  is_fallback      boolean generated always as (source = 'fallback') stored,
  uploaded_at      timestamptz not null default now(),
  unique (registration_id, division)
);

create index vsyc_music_registration_idx on public.vsyc_music (registration_id);

alter table public.vsyc_music enable row level security;
create policy service_role_all_music on public.vsyc_music using (auth.role() = 'service_role');

-- A track must belong to a division the player entered.
create function public.vsyc_check_music_division() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.vsyc_registrations r
                  where r.id = new.registration_id and new.division = any (r.divisions::text[])) then
    raise exception 'Registration is not entered in %', new.division using errcode = '23514';
  end if;
  return new;
end $$;

create trigger vsyc_music_check_division
  before insert or update of registration_id, division on public.vsyc_music
  for each row execute function public.vsyc_check_music_division();

-- Keep the "has music" timestamp on the registration current.
create function public.vsyc_sync_music_uploaded_at() returns trigger
language plpgsql set search_path = '' as $$
declare
  rid uuid := coalesce(new.registration_id, old.registration_id);
begin
  update public.vsyc_registrations r
     set music_uploaded_at = (select max(m.uploaded_at) from public.vsyc_music m
                               where m.registration_id = rid and not m.is_fallback)
   where r.id = rid;
  return null;
end $$;

create trigger vsyc_music_sync_uploaded_at
  after insert or update or delete on public.vsyc_music
  for each row execute function public.vsyc_sync_music_uploaded_at();

-- Backfill from the old single slot. The trigger above re-derives music_uploaded_at, which is
-- the same value for every row that already had one.
insert into public.vsyc_music (registration_id, division, object_name, filename, uploaded_at, source)
select r.id,
       coalesce(
         (select d from unnest(r.divisions::text[]) d where upper(d) = upper(split_part(r.music_filename, '_', 1)) limit 1),
         r.divisions[1]::text
       ),
       r.music_filename,
       r.music_filename,
       coalesce(r.music_uploaded_at, now()),
       'backfill'
  from public.vsyc_registrations r
 where r.music_filename is not null
   and cardinality(r.divisions) > 0
on conflict (registration_id, division) do nothing;
