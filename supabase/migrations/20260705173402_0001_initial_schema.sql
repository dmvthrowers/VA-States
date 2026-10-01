-- VSYC-26 Registration — Initial Schema
-- Apply in Supabase SQL editor on the NEW vsyc26 project (isolated from yoyo-player-map).

-- ========== ENUMS ==========
create type registration_source as enum ('online', 'late_email', 'walk_up', 'soft_launch');
create type payment_method as enum ('venmo', 'paypal', 'check', 'cash', 'comp', 'pending');
create type division_code as enum ('1A', 'X', 'SBJ');
create type x_substyle as enum ('2A', '3A', '4A', '5A');

-- ========== COMP CODES ==========
create table vsyc_comp_codes (
  code              text primary key,
  description       text not null,
  max_uses          int not null default 1,
  uses_count        int not null default 0,
  expires_at        timestamptz not null default '2026-09-12 23:59:59-04',
  created_at        timestamptz not null default now(),
  active            boolean not null default true
);

-- ========== REGISTRATIONS ==========
create table vsyc_registrations (
  id                        uuid primary key default gen_random_uuid(),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  -- Player info
  first_name                text not null,
  last_name                 text not null,
  preferred_bracket_name    text,
  age_on_event              int not null,
  pronouns                  text,
  email                     text not null,
  phone                     text not null,
  city                      text not null,
  state                     text not null,
  club_affiliation          text,

  -- Minor consent (is_minor computed from age_on_event)
  is_minor                  boolean generated always as (age_on_event < 18) stored,
  parent_name               text,
  parent_email              text,
  parent_consented          boolean default false,

  -- Divisions
  divisions                 division_code[] not null check (array_length(divisions, 1) >= 1),
  x_substyle                x_substyle,
  combo_applied             boolean not null default false,

  -- Pricing
  comp_code                 text references vsyc_comp_codes(code),
  early_bird_applied        boolean not null default false,
  walk_up_surcharge         boolean not null default false,
  fee_cents                 int not null,
  registration_source       registration_source not null default 'online',

  -- Music
  music_path                text,
  music_filename            text,
  music_uploaded_at         timestamptz,
  music_upload_token        text unique,

  -- Waivers (all required true to submit — enforced in DB and API)
  liability_waiver_accepted boolean not null,
  photo_video_consent       boolean not null,
  code_of_conduct_accepted  boolean not null,

  -- Optional
  emergency_contact_name    text,
  emergency_contact_phone   text,
  volunteer_interest        boolean default false,
  accessibility_needs       text,
  merch_order               jsonb,
  merch_total_cents         int default 0,

  -- Admin
  paid                      boolean not null default false,
  paid_at                   timestamptz,
  payment_method            payment_method default 'pending',
  bracket_seed              int,
  admin_notes               text,

  -- Audit
  ip_address                inet,
  user_agent                text,

  -- Constraints
  constraint minor_requires_parent check (
    (is_minor = false) or
    (parent_name is not null and parent_email is not null and parent_consented = true)
  ),
  constraint x_requires_substyle check (
    not ('X' = any(divisions)) or x_substyle is not null
  ),
  constraint waivers_required check (
    liability_waiver_accepted = true
    and photo_video_consent = true
    and code_of_conduct_accepted = true
  )
);

create index idx_vsyc_email     on vsyc_registrations (lower(email));
create index idx_vsyc_paid      on vsyc_registrations (paid);
create index idx_vsyc_created   on vsyc_registrations (created_at desc);
create index idx_vsyc_divisions on vsyc_registrations using gin (divisions);

-- updated_at trigger
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger vsyc_registrations_updated_at
  before update on vsyc_registrations
  for each row execute function set_updated_at();

-- ========== AUDIT LOG ==========
create table vsyc_audit_log (
  id               bigserial primary key,
  created_at       timestamptz not null default now(),
  registration_id  uuid references vsyc_registrations(id) on delete set null,
  actor            text not null,
  action           text not null,
  details          jsonb
);

create index idx_audit_registration on vsyc_audit_log (registration_id);
create index idx_audit_created      on vsyc_audit_log (created_at desc);

-- ========== RLS ==========
-- Service role bypasses RLS automatically. Anon gets nothing.
alter table vsyc_registrations enable row level security;
alter table vsyc_comp_codes     enable row level security;
alter table vsyc_audit_log      enable row level security;

create policy "service_role_all_registrations" on vsyc_registrations
  for all using (auth.role() = 'service_role');
create policy "service_role_all_codes" on vsyc_comp_codes
  for all using (auth.role() = 'service_role');
create policy "service_role_all_audit" on vsyc_audit_log
  for all using (auth.role() = 'service_role');
