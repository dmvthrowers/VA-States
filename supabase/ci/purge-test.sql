-- Season purge test (build plan 4.4). Runs in CI after the migrations replay, on the empty CI database only.
-- Seeds a small season, checks the dry run changes nothing, then applies the purge and checks what was kept,
-- anonymized and deleted. Fails (raises) on the first wrong answer.
\set ON_ERROR_STOP on
begin;

insert into vsyc_comp_codes (code, description, max_uses, expires_at, discount_percent) values ('TESTCODE', 'test', 5, now() + interval '1 day', 100);

insert into vsyc_registrations (id, first_name, last_name, preferred_bracket_name, age_on_event, email, phone, city, state, parent_name, parent_email, parent_consented,
  divisions, fee_cents, liability_waiver_accepted, photo_video_consent, code_of_conduct_accepted, emergency_contact_name, emergency_contact_phone,
  nickname, bio, music_upload_token, paid, paid_at, payment_intent_id, amount_paid_cents, comp_code, home_address, home_zip, ip_address, auth_user_id)
values
  ('00000000-0000-4000-8000-000000000001', 'Ada', 'Adult', 'AdaYo', 30, 'ada@example.org', '555-0001', 'Reston', 'VA', null, null, false,
   array['1A'], 3000, true, true, true, 'Pat', '555-0002', 'Ada!', 'bio', 'tok1', true, now(), 'pi_1', 3000, null, '1 Main St', '20190', '1.2.3.4', gen_random_uuid()),
  ('00000000-0000-4000-8000-000000000002', 'Kit', 'Kid', null, 12, 'kit@example.org', '555-0003', 'Rockville', 'MD', 'Pat Parent', 'pat@example.org', true,
   array['SBJ'], 2000, true, true, true, 'Pat', '555-0004', null, null, 'tok2', true, now(), 'pi_2', 2000, 'TESTCODE', null, null, null, null);

insert into vsyc_scores (registration_id, division, judge_name) values ('00000000-0000-4000-8000-000000000001', '1A', 'Judge One');
insert into vsyc_run_order (division, registration_id, position, status) values ('1A', '00000000-0000-4000-8000-000000000001', 1, 'done');
insert into vsyc_music (registration_id, division, object_name, filename, source, slot) values ('00000000-0000-4000-8000-000000000001', '1A', 'x/1A.mp3', '1A.mp3', 'player', 'main');
insert into vsyc26_survey_responses (survey_type, answers, contact_email, allow_quote, source) values ('competitor', '{}'::jsonb, 'ada@example.org', false, 'email');
insert into email_outbox (template, to_email, payload, priority) values ('confirmation', 'ada@example.org', '{}'::jsonb, 0);
insert into vsyc_volunteers (id, first_name, last_name, email, phone, is_18_or_older, parent_guardian_name, parent_guardian_email, parent_guardian_phone, role_choice_1, experience_notes, liability_accepted, code_of_conduct_accepted)
values ('00000000-0000-4000-8000-000000000011', 'Val', 'Teen', 'val@example.org', '555-0005', false, 'Gwen Guardian', 'gwen@example.org', '555-0006', 'dj_audio_tech', 'ran the booth last year', true, true);
insert into vsyc_spectators (id, first_name, last_name, email, state, liability_accepted, code_of_conduct_accepted)
values ('00000000-0000-4000-8000-000000000021', 'Sam', 'Spectator', 'sam@example.org', 'VA', true, true);
insert into vsyc_staff_accounts (auth_user_id, role, display_name) values (gen_random_uuid(), 'admin', 'Admin'), (gen_random_uuid(), 'judge', 'Judge One');

-- Dry run: counts only, nothing changes.
do $$
declare r jsonb;
begin
  r := vsyc_season_purge(2026, date '2026-09-19', '[]'::jsonb);
  assert (r->>'applied')::boolean = false, 'dry run must not apply';
  assert (r->'counts'->>'registrations_to_anonymize')::int = 2, 'two registrations to anonymize: ' || r::text;
  assert (r->'counts'->>'scores_to_delete')::int = 1, 'one score to delete';
  assert (select count(*) from vsyc_scores) = 1, 'dry run deleted a score';
  assert (select count(*) from vsyc_registrations where email like '%@anonymized.invalid') = 0, 'dry run anonymized someone';
end $$;

-- Apply needs the exact confirmation.
do $$
begin
  begin
    perform vsyc_season_purge(2026, date '2026-09-19', '[]'::jsonb, true, 'yes');
    raise exception 'apply ran without the confirmation';
  exception when others then
    assert sqlerrm like 'to apply, p_confirm must be exactly%', 'wrong error: ' || sqlerrm;
  end;
end $$;

-- Apply.
\o /dev/null
select vsyc_season_purge(2026, date '2026-09-19',
  '[{"division":"1A","place":1,"display_name":"AdaYo","state":"VA","is_state_champion":true}]'::jsonb, true, 'PURGE 2026');
\o

do $$
declare k record;
begin
  -- Deleted
  assert (select count(*) from vsyc_scores) = 0, 'scores remain';
  assert (select count(*) from vsyc_run_order) = 0, 'run order remains';
  assert (select count(*) from vsyc_music) = 0, 'music rows remain';
  assert (select count(*) from vsyc_event_flags) = 0, 'event flags remain';
  assert (select count(*) from vsyc_comp_codes) = 0, 'comp codes remain';
  assert (select count(*) from vsyc26_survey_responses) = 0, 'survey responses remain';
  assert (select count(*) from email_outbox) = 0, 'outbox remains';

  -- Anonymized, stats and payment kept
  select * into k from vsyc_registrations where id = '00000000-0000-4000-8000-000000000001';
  assert k.first_name = 'Anonymous' and k.last_name = '' and k.email = k.id::text || '@anonymized.invalid', 'adult not anonymized';
  assert k.phone = '' and k.city = '' and k.home_address is null and k.home_zip is null and k.nickname is null and k.bio is null, 'adult details remain';
  assert k.music_upload_token is null and k.ip_address is null and k.auth_user_id is null and k.emergency_contact_name is null, 'adult links remain';
  assert k.state = 'VA' and k.age_on_event = 30 and k.fee_cents = 3000 and k.paid and k.payment_intent_id = 'pi_1' and k.amount_paid_cents = 3000, 'stats or payment record lost';
  assert k.divisions = array['1A'], 'divisions lost';

  select * into k from vsyc_registrations where id = '00000000-0000-4000-8000-000000000002';
  assert k.parent_name = 'Anonymized' and k.parent_email = 'anonymized' and k.parent_consented, 'minor guardian placeholder wrong';
  assert k.comp_code is null, 'comp code link remains';
  assert k.liability_waiver_accepted and k.photo_video_consent and k.code_of_conduct_accepted, 'waiver flags changed';

  assert (select first_name from vsyc_volunteers) = 'Anonymous' and (select parent_guardian_email from vsyc_volunteers) is null and (select parent_guardian_name from vsyc_volunteers) = 'Anonymized' and (select experience_notes from vsyc_volunteers) = '', 'volunteer not anonymized';
  assert (select email from vsyc_spectators) like '%@anonymized.invalid', 'spectator not anonymized';

  -- Consent records: adult 3 years, minor until 21 (age 12 -> 10 years), guardian is the signer
  select * into k from vsyc_consent_records where source_id = '00000000-0000-4000-8000-000000000001';
  assert k.signer_role = 'self' and k.keep_until = date '2029-09-19' and k.signer_name = 'Ada Adult', 'adult consent record wrong';
  select * into k from vsyc_consent_records where source_id = '00000000-0000-4000-8000-000000000002';
  assert k.signer_role = 'guardian' and k.signer_name = 'Pat Parent' and k.signer_email = 'pat@example.org' and k.keep_until = date '2036-09-19', 'minor consent record wrong: ' || k::text;
  select * into k from vsyc_consent_records where source_id = '00000000-0000-4000-8000-000000000011';
  assert k.signer_role = 'guardian' and k.signer_name = 'Gwen Guardian', 'volunteer consent record wrong';
  assert (select count(*) from vsyc_consent_records) = 4, 'expected four consent records';

  -- Champions, staff, audit
  assert (select count(*) from vsyc_past_champions where display_name = 'AdaYo' and is_state_champion and season = 2026) = 1, 'champion not recorded';
  assert (select count(*) from vsyc_staff_accounts where role = 'admin' and is_active) = 1, 'admin was deactivated';
  assert (select count(*) from vsyc_staff_accounts where role = 'judge' and is_active) = 0, 'judge still active';
  assert (select count(*) from vsyc_audit_log where action = 'season_purge') = 1, 'no audit row';
  assert (select details::text from vsyc_audit_log where action = 'season_purge') not like '%Ada%', 'audit row has a name';
end $$;

-- A second run changes nothing (idempotent): no one left to anonymize, no new consent records.
do $$
declare r jsonb;
begin
  r := vsyc_season_purge(2026, date '2026-09-19', '[]'::jsonb, true, 'PURGE 2026');
  assert (r->'counts'->>'registrations_to_anonymize')::int = 0, 'second run found people to anonymize';
  assert (select count(*) from vsyc_consent_records) = 4, 'second run duplicated consent records';
end $$;

-- Expiry: nothing is due today; far in the future everything is.
do $$
declare r jsonb;
begin
  r := vsyc_expire_old_records(date '2027-01-01');
  assert (r->>'consent_records')::int = 0 and (r->>'registrations')::int = 0, 'something expired too early: ' || r::text;
  r := vsyc_expire_old_records(date '2050-01-01', true);
  assert (r->>'consent_records')::int = 4, 'consent records did not expire: ' || r::text;
  assert (select count(*) from vsyc_consent_records) = 0, 'expired consent records remain';
  assert (select count(*) from vsyc_registrations) = 0, 'old anonymized registrations remain';
end $$;

rollback;
select 'purge test OK' as result;
