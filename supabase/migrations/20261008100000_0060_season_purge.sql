-- Season purge and reset (build plan 4.4, docs/specs/season-archive.md). ADDITIVE: two new tables and two new
-- functions. Nothing here runs by itself and nothing is deleted by applying this migration. The functions are
-- called by `npm run purge` (a person, after a backup and after the archive is live), and only with service-role.
--
-- Retention decisions this encodes (owner, build plan "Decisions made"):
--   * Payment records ........ kept 7 years. The registration row stays (anonymized) with its payment fields.
--   * Waivers and guardian consent ... kept until the minor turns 21, 3 years for adults. They move to
--     vsyc_consent_records with a keep_until date and are deleted by vsyc_expire_old_records().
--   * Registrant personal data ... anonymized after the archive merges; stats kept (division, state, age,
--     fees, when they registered).
--   * Player accounts ......... kept across seasons; each season's data is detached from the account.
--   * Past champions .......... kept in vsyc_past_champions, public names only.
--   * Not purged: the audit log (retention window not decided yet), payment flags and Stripe events (payment
--     records), budget, sponsors and sponsor inquiries (own retention), the permanent staff accounts.

create table public.vsyc_past_champions (
  id                bigint generated always as identity primary key,
  season            integer not null check (season between 2000 and 2999),
  division          text not null,
  place             integer not null check (place >= 1),
  display_name      text not null check (length(trim(display_name)) > 0),
  state             text,
  is_state_champion boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (season, division, display_name, place)
);

create table public.vsyc_consent_records (
  id             bigint generated always as identity primary key,
  source_table   text not null check (source_table in ('vsyc_registrations', 'vsyc_volunteers', 'vsyc_spectators')),
  source_id      uuid not null,
  season         integer not null check (season between 2000 and 2999),
  signer_role    text not null check (signer_role in ('self', 'guardian')),
  signer_name    text not null,
  signer_email   text,
  participant_name text not null,
  age_on_event   integer,
  waiver_accepted boolean not null,
  photo_video_consent boolean,
  code_of_conduct_accepted boolean not null,
  event_date     date not null,
  keep_until     date not null,
  created_at     timestamptz not null default now(),
  unique (source_table, source_id)
);
create index vsyc_consent_records_keep_until on public.vsyc_consent_records (keep_until);

alter table public.vsyc_past_champions enable row level security;
alter table public.vsyc_consent_records enable row level security;
create policy service_role_all_past_champions on public.vsyc_past_champions using (auth.role() = 'service_role');
create policy service_role_all_consent_records on public.vsyc_consent_records using (auth.role() = 'service_role');
-- Champions are public names by design; the consent records hold signers' contact details and stay private.
create policy public_read_past_champions on public.vsyc_past_champions for select using (true);

-- keep_until: a minor's record is kept until they turn 21 (counted from their age on event day, rounded up a
-- year so the date is never early); an adult's for 3 years after the event.
create or replace function public.vsyc_consent_keep_until(p_age integer, p_event_date date) returns date
language sql immutable as $$
  select case when p_age < 18 then (p_event_date + make_interval(years => (21 - p_age) + 1))::date
              else (p_event_date + interval '3 years')::date end
$$;

-- The season purge. With p_apply = false (the default) it only counts what it would do. With p_apply = true it
-- does all of it in one transaction (all or nothing) and writes one audit row of counts, not names.
-- p_champions: [{ "division": "1A", "place": 1, "display_name": "...", "state": "VA", "is_state_champion": true }]
-- built by the script from the same public data the archive uses. Returns a jsonb of counts.
create or replace function public.vsyc_season_purge(
  p_season integer,
  p_event_date date,
  p_champions jsonb default '[]'::jsonb,
  p_apply boolean default false,
  p_confirm text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c jsonb := '{}'::jsonb;
  n bigint;
  anon_email constant text := '@anonymized.invalid';
begin
  if p_season is null or p_season < 2000 or p_season > 2999 then raise exception 'season must be a year'; end if;
  if p_event_date is null then raise exception 'event date is required'; end if;
  if p_apply and p_confirm is distinct from ('PURGE ' || p_season::text) then
    raise exception 'to apply, p_confirm must be exactly "PURGE %"', p_season;
  end if;
  if jsonb_typeof(p_champions) <> 'array' then raise exception 'p_champions must be a JSON array'; end if;

  -- ---- counts (always) ----
  c := c || jsonb_build_object(
    'champions_to_record', jsonb_array_length(p_champions),
    'consent_records_to_write',
      (select count(*) from vsyc_registrations r where r.email not like '%' || anon_email
         and not exists (select 1 from vsyc_consent_records k where k.source_table = 'vsyc_registrations' and k.source_id = r.id))
      + (select count(*) from vsyc_volunteers v where v.email not like '%' || anon_email
         and not exists (select 1 from vsyc_consent_records k where k.source_table = 'vsyc_volunteers' and k.source_id = v.id))
      + (select count(*) from vsyc_spectators s where s.email not like '%' || anon_email
         and not exists (select 1 from vsyc_consent_records k where k.source_table = 'vsyc_spectators' and k.source_id = s.id)),
    'registrations_to_anonymize', (select count(*) from vsyc_registrations where email not like '%' || anon_email),
    'volunteers_to_anonymize', (select count(*) from vsyc_volunteers where email not like '%' || anon_email),
    'spectators_to_anonymize', (select count(*) from vsyc_spectators where email not like '%' || anon_email),
    'scores_to_delete', (select count(*) from vsyc_scores),
    'run_order_to_delete', (select count(*) from vsyc_run_order),
    'round_plans_to_delete', (select count(*) from vsyc_round_plans),
    'schedule_state_to_delete', (select count(*) from vsyc_schedule_state),
    'results_releases_to_delete', (select count(*) from vsyc_results_releases),
    'bracket_matches_to_delete', (select count(*) from vsyc_bracket_matches),
    'battle_votes_to_delete', (select count(*) from vsyc_battle_votes),
    'ladder_attempts_to_delete', (select count(*) from vsyc_ladder_attempts),
    'teams_to_delete', (select count(*) from vsyc_teams),
    'team_members_to_delete', (select count(*) from vsyc_team_members),
    'music_rows_to_delete', (select count(*) from vsyc_music),
    'side_entries_to_delete', (select count(*) from vsyc_side_entries),
    'survey_responses_to_delete', (select count(*) from vsyc26_survey_responses),
    'survey_contacts_to_delete', (select count(*) from vsyc26_survey_contacts),
    'email_outbox_to_delete', (select count(*) from email_outbox),
    'comp_codes_to_delete', (select count(*) from vsyc_comp_codes),
    'event_flags_to_reset', (select count(*) from vsyc_event_flags),
    'staff_to_deactivate', (select count(*) from vsyc_staff_accounts where role <> 'admin' and is_active)
  );

  if not p_apply then return jsonb_build_object('applied', false, 'season', p_season, 'counts', c); end if;

  -- ---- apply ----
  -- 1. What the club keeps: past champions (public names only).
  insert into vsyc_past_champions (season, division, place, display_name, state, is_state_champion)
  select p_season, e->>'division', (e->>'place')::int, e->>'display_name', nullif(e->>'state', ''), coalesce((e->>'is_state_champion')::boolean, false)
  from jsonb_array_elements(p_champions) e
  on conflict (season, division, display_name, place) do nothing;

  -- 2. Consent records, before the personal data is anonymized.
  insert into vsyc_consent_records (source_table, source_id, season, signer_role, signer_name, signer_email, participant_name,
                                    age_on_event, waiver_accepted, photo_video_consent, code_of_conduct_accepted, event_date, keep_until)
  select 'vsyc_registrations', r.id, p_season,
         case when r.is_minor then 'guardian' else 'self' end,
         case when r.is_minor then coalesce(r.parent_name, 'Unknown guardian') else r.first_name || ' ' || r.last_name end,
         case when r.is_minor then r.parent_email else r.email end,
         r.first_name || ' ' || r.last_name, r.age_on_event, r.liability_waiver_accepted, r.photo_video_consent, r.code_of_conduct_accepted,
         p_event_date, vsyc_consent_keep_until(r.age_on_event, p_event_date)
  from vsyc_registrations r
  where r.email not like '%' || anon_email
  on conflict (source_table, source_id) do nothing;

  insert into vsyc_consent_records (source_table, source_id, season, signer_role, signer_name, signer_email, participant_name,
                                    age_on_event, waiver_accepted, photo_video_consent, code_of_conduct_accepted, event_date, keep_until)
  select 'vsyc_volunteers', v.id, p_season,
         case when v.is_18_or_older then 'self' else 'guardian' end,
         case when v.is_18_or_older then v.first_name || ' ' || v.last_name else coalesce(v.parent_guardian_name, 'Unknown guardian') end,
         case when v.is_18_or_older then v.email else v.parent_guardian_email end,
         v.first_name || ' ' || v.last_name,
         case when v.is_18_or_older then null else 13 end,
         v.liability_accepted, v.photo_video_consent, v.code_of_conduct_accepted,
         p_event_date, vsyc_consent_keep_until(case when v.is_18_or_older then 18 else 13 end, p_event_date)
  from vsyc_volunteers v
  where v.email not like '%' || anon_email
  on conflict (source_table, source_id) do nothing;

  insert into vsyc_consent_records (source_table, source_id, season, signer_role, signer_name, signer_email, participant_name,
                                    age_on_event, waiver_accepted, photo_video_consent, code_of_conduct_accepted, event_date, keep_until)
  select 'vsyc_spectators', s.id, p_season, 'self', s.first_name || ' ' || s.last_name, s.email, s.first_name || ' ' || s.last_name,
         null, s.liability_accepted, null, s.code_of_conduct_accepted, p_event_date, vsyc_consent_keep_until(18, p_event_date)
  from vsyc_spectators s
  where s.email not like '%' || anon_email
  on conflict (source_table, source_id) do nothing;

  -- 3. The season's operational data.
  delete from vsyc_battle_votes;
  delete from vsyc_bracket_matches;
  delete from vsyc_ladder_attempts;
  delete from vsyc_scores;
  delete from vsyc_run_order;
  delete from vsyc_round_plans;
  delete from vsyc_results_releases;
  delete from vsyc_schedule_state;
  delete from vsyc_team_members;
  delete from vsyc_teams;
  delete from vsyc_music;
  delete from vsyc_side_entries;
  delete from vsyc26_survey_responses;
  delete from vsyc26_survey_contacts;
  delete from email_outbox;

  -- 4. Comp codes and flags: registrations point at comp codes, so let go of them first.
  update vsyc_registrations set comp_code = null where comp_code is not null;
  update vsyc_volunteers set comp_code = null where comp_code is not null;
  delete from vsyc_comp_codes;
  delete from vsyc_event_flags;

  -- 5. Anonymize people. Payment fields, division, state, age, fees and dates stay (stats and the 7-year
  -- payment record). Rows stay valid under their checks: waivers stay true; minors keep placeholder guardian fields.
  update vsyc_registrations set
    first_name = 'Anonymous', last_name = '', preferred_bracket_name = null, pronouns = null,
    email = id::text || anon_email, phone = '', city = '', club_affiliation = null,
    parent_name = case when is_minor then 'Anonymized' else null end,
    parent_email = case when is_minor then 'anonymized' else null end,
    emergency_contact_name = null, emergency_contact_phone = null, emergency_contact_relationship = null,
    accessibility_needs = null, admin_notes = null, scheduling_notes = null, performance_time_pref = null,
    nickname = null, photo_url = null, bio = null, team = null, yoyo = null, string = null, counterweight = null,
    socials = '{}'::jsonb, is_public = false, home_address = null, home_zip = null,
    music_path = null, music_filename = null, music_uploaded_at = null, music_upload_token = null,
    merch_order = null, ip_address = null, user_agent = null, auth_user_id = null
  where email not like '%' || anon_email;

  update vsyc_volunteers set
    first_name = 'Anonymous', last_name = '', email = id::text || anon_email, phone = '', pronouns = null,
    -- The table's checks still apply: a minor keeps a guardian name and phone, and some roles need notes, so the
    -- fields become empty placeholders instead of null where a check requires a value.
    parent_guardian_name = case when is_18_or_older then null else 'Anonymized' end,
    parent_guardian_email = null,
    parent_guardian_phone = case when is_18_or_older then null else '' end,
    experience_notes = case when experience_notes is not null then '' else null end,
    other_role_description = case when other_role_description is not null then '' else null end,
    emergency_contact_name = null, emergency_contact_phone = null,
    admin_notes = null, ip_address = null, user_agent = null
  where email not like '%' || anon_email;

  update vsyc_spectators set
    first_name = 'Anonymous', last_name = '', nickname = null, email = id::text || anon_email, photo_url = null, bio = null,
    team = null, club = null, yoyo = null, string = null, counterweight = null, socials = '{}'::jsonb, is_public = false,
    pronouns = null, ip_address = null, user_agent = null, auth_user_id = null
  where email not like '%' || anon_email;

  -- 6. Contest-day staff lose access; the club's admins stay.
  update vsyc_staff_accounts set is_active = false where role <> 'admin' and is_active;

  -- 7. One audit row of counts, no names.
  insert into vsyc_audit_log (actor, action, details) values ('purge', 'season_purge', jsonb_build_object('season', p_season, 'counts', c));

  return jsonb_build_object('applied', true, 'season', p_season, 'counts', c);
end;
$$;

-- Records past their keep_until, and anonymized registrations past the 7-year payment-record window.
-- Dry run by default.
create or replace function public.vsyc_expire_old_records(p_today date default current_date, p_apply boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  consent_n bigint;
  reg_n bigint;
begin
  select count(*) into consent_n from vsyc_consent_records where keep_until < p_today;
  select count(*) into reg_n from vsyc_registrations
    where email like '%@anonymized.invalid' and created_at < (p_today - interval '7 years');
  if p_apply then
    delete from vsyc_consent_records where keep_until < p_today;
    delete from vsyc_registrations where email like '%@anonymized.invalid' and created_at < (p_today - interval '7 years');
    insert into vsyc_audit_log (actor, action, details)
      values ('purge', 'expire_old_records', jsonb_build_object('consent_records', consent_n, 'registrations', reg_n));
  end if;
  return jsonb_build_object('applied', p_apply, 'consent_records', consent_n, 'registrations', reg_n);
end;
$$;

-- Service role only: these delete data.
revoke all on function public.vsyc_season_purge(integer, date, jsonb, boolean, text) from public, anon, authenticated;
revoke all on function public.vsyc_expire_old_records(date, boolean) from public, anon, authenticated;
grant execute on function public.vsyc_season_purge(integer, date, jsonb, boolean, text) to service_role;
grant execute on function public.vsyc_expire_old_records(date, boolean) to service_role;
