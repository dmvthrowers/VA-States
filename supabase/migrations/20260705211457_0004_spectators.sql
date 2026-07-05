-- Applied to prod 2026-07-05 via Supabase MCP.
-- VSYC-26 Spectator RSVP (free) — separate from competitor registrations.
CREATE TABLE vsyc_spectators (
  id                        uuid primary key default gen_random_uuid(),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  first_name                text not null,
  last_name                 text not null,
  nickname                  text,
  email                     text not null,
  state                     text not null,

  photo_url                 text,
  bio                       text,
  team                      text,
  club                      text,
  yoyo                      text,
  string                    text,
  counterweight             text,
  socials                   jsonb not null default '{}'::jsonb,

  is_public                 boolean not null default false,

  liability_accepted        boolean not null,
  code_of_conduct_accepted  boolean not null,

  -- Set once they verify a magic link (Supabase Auth) — enables self-service edit.
  auth_user_id              uuid,

  ip_address                inet,
  user_agent                text,

  constraint spectator_waivers_required check (
    liability_accepted = true and code_of_conduct_accepted = true
  )
);

create index idx_vsyc_spectators_email on vsyc_spectators (lower(email));
create index idx_vsyc_spectators_public on vsyc_spectators (is_public);
create unique index idx_vsyc_spectators_auth_user on vsyc_spectators (auth_user_id) where auth_user_id is not null;

create trigger vsyc_spectators_updated_at
  before update on vsyc_spectators
  for each row execute function set_updated_at();

alter table vsyc_spectators enable row level security;
create policy "service_role_all_spectators" on vsyc_spectators
  for all using (auth.role() = 'service_role');

-- Shared public-profile view for the "Who's Coming" directory (competitors + spectators).
-- NOTE: superseded by 20260705212737_0006b_recreate_public_profiles_view.sql
create or replace view vsyc_public_profiles as
select
  r.id,
  'competitor'::text as role,
  coalesce(r.preferred_bracket_name, r.first_name || ' ' || r.last_name) as display_name,
  r.city,
  r.state,
  r.club_affiliation as club,
  null::text as team,
  null::text as bio,
  null::text as photo_url,
  null::jsonb as socials,
  r.divisions::text[] as divisions,
  true as is_public_default
from vsyc_registrations r
where r.paid = true
union all
select
  s.id,
  'spectator'::text as role,
  coalesce(s.nickname, s.first_name || ' ' || s.last_name) as display_name,
  null::text as city,
  s.state,
  s.club as club,
  s.team as team,
  s.bio as bio,
  s.photo_url as photo_url,
  s.socials as socials,
  null::text[] as divisions,
  s.is_public as is_public_default
from vsyc_spectators s
where s.is_public = true;
