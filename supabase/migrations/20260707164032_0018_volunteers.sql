-- VSYC-26 Volunteer program: role catalog + applications.
-- Roles are event-runner discretion for final assignment (vsyc_volunteers.assigned_role),
-- separate from the applicant's ranked preferences (role_choice_1 / role_choice_2).
-- Judge roles (sport_division_judge, 1a_pro_judge, x_division_judge) share a combined
-- pool cap of 9 via group_key/group_max_capacity instead of an individual max_capacity.

CREATE TABLE IF NOT EXISTS vsyc_volunteer_roles (
  role_key            text PRIMARY KEY,
  label               text NOT NULL,
  category            text NOT NULL CHECK (category IN ('core', 'judge', 'non_core')),
  description         text NOT NULL,
  max_capacity        integer,                 -- null for roles governed by a group cap
  group_key           text,                     -- e.g. 'judge_pool'; null if role has its own cap
  group_max_capacity  integer,
  is_priority         boolean NOT NULL DEFAULT false,
  sort_order          integer NOT NULL DEFAULT 0,
  CONSTRAINT vsyc_volunteer_roles_cap_check CHECK (
    (max_capacity IS NOT NULL AND group_key IS NULL)
    OR (max_capacity IS NULL AND group_key IS NOT NULL AND group_max_capacity IS NOT NULL)
  )
);

INSERT INTO vsyc_volunteer_roles (role_key, label, category, description, max_capacity, group_key, group_max_capacity, is_priority, sort_order) VALUES
  ('dj_audio_tech',         'DJ / Audio Technician',        'core',     'Runs the PA system and plays competitor music tracks live. Needs sound experience.',                              1,    NULL,         NULL, false, 100),
  ('mc_host',               'MC / Host',                    'core',     'Announces competitors, hypes the crowd, and hosts awards. Comfortable on a mic.',                                   1,    NULL,         NULL, false, 101),
  ('streaming',             'Streaming',                    'core',     'Operates the livestream camera and platform for remote viewers.',                                                  1,    NULL,         NULL, false, 102),
  ('sport_division_judge',  'Sport Division Judge',         'judge',    'Scores freestyles for the Sport division. Goal: 3-4 judges per panel plus a senior judge.',                        NULL, 'judge_pool', 9,    false, 200),
  ('1a_pro_judge',          '1A Pro Division Judge',        'judge',    'Scores freestyles for the 1A Pro division. Goal: 3-4 judges per panel plus a senior judge.',                        NULL, 'judge_pool', 9,    false, 201),
  ('x_division_judge',      'X Division Judge',             'judge',    'Scores freestyles for the X division. Goal: 3-4 judges per panel plus a senior judge.',                            NULL, 'judge_pool', 9,    false, 202),
  ('registration_booth',    'Registration Booth Attendant', 'non_core', 'Highest-priority support role. Checks in competitors and spectators, handles day-of sign-ups.',                    4,    NULL,         NULL, true,  300),
  ('event_setup_am',        'Event Setup (AM)',             'non_core', 'Morning load-in and venue setup before doors open.',                                                                4,    NULL,         NULL, false, 301),
  ('event_breakdown_pm',    'Event Breakdown (PM)',         'non_core', 'Afternoon/evening load-out and venue teardown.',                                                                    4,    NULL,         NULL, false, 302),
  ('stage_attendant',       'Stage Attendant',              'non_core', 'Supports competitors at the stage - mats, props, and flow between freestyles.',                                    4,    NULL,         NULL, false, 303),
  ('workshop_attendant',    'Workshop Attendant',           'non_core', 'Helps run workshop stations and assists attendees learning tricks.',                                                4,    NULL,         NULL, false, 304),
  ('club_table_attendant',  'Club Table Attendant',         'non_core', 'Staffs the DMV Throwers info/merch table.',                                                                         4,    NULL,         NULL, false, 305),
  ('videography',           'Videography',                  'non_core', 'Records freestyles and general event coverage footage.',                                                           4,    NULL,         NULL, false, 306),
  ('photography',           'Photography',                  'non_core', 'Photographs freestyles, awards, and crowd/vendor coverage.',                                                       4,    NULL,         NULL, false, 307),
  ('parent_chaperone',      'Parent Chaperone',             'non_core', 'Supports supervision of minor competitors and attendees throughout the day.',                                     4,    NULL,         NULL, false, 308)
ON CONFLICT (role_key) DO UPDATE SET
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  max_capacity = EXCLUDED.max_capacity,
  group_key = EXCLUDED.group_key,
  group_max_capacity = EXCLUDED.group_max_capacity,
  is_priority = EXCLUDED.is_priority,
  sort_order = EXCLUDED.sort_order;

ALTER TABLE vsyc_volunteer_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_volunteer_roles" ON vsyc_volunteer_roles;
CREATE POLICY "service_role_all_volunteer_roles" ON vsyc_volunteer_roles
  FOR ALL USING ((select auth.role()) = 'service_role');
-- No anon policy needed — like the rest of this app, public pages/routes read
-- through server components/route handlers using the service-role admin client
-- (see lib/supabase/admin.ts), never a browser-side anon client.

CREATE TABLE IF NOT EXISTS vsyc_volunteers (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),

  first_name                 text NOT NULL,
  last_name                  text NOT NULL,
  email                      text NOT NULL,
  phone                      text NOT NULL,
  pronouns                   text,

  is_18_or_older             boolean NOT NULL DEFAULT true,
  parent_guardian_name       text,
  parent_guardian_email      text,
  parent_guardian_phone      text,

  role_choice_1              text NOT NULL REFERENCES vsyc_volunteer_roles (role_key),
  role_choice_2              text REFERENCES vsyc_volunteer_roles (role_key),
  shift_preference           text NOT NULL DEFAULT 'flexible' CHECK (shift_preference IN ('am', 'pm', 'full_day', 'flexible')),
  experience_notes           text,

  emergency_contact_name     text,
  emergency_contact_phone    text,
  photo_video_consent        boolean NOT NULL DEFAULT false,

  liability_accepted         boolean NOT NULL,
  code_of_conduct_accepted   boolean NOT NULL,

  status                     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'waitlisted', 'declined', 'withdrawn')),
  assigned_role              text REFERENCES vsyc_volunteer_roles (role_key),
  is_paid_role               boolean NOT NULL DEFAULT false,
  honorarium_cents           integer,
  admin_notes                text,

  ip_address                 inet,
  user_agent                 text,

  CONSTRAINT vsyc_volunteers_waivers_required CHECK (
    liability_accepted = true AND code_of_conduct_accepted = true
  ),
  CONSTRAINT vsyc_volunteers_choices_distinct CHECK (
    role_choice_2 IS NULL OR role_choice_2 <> role_choice_1
  ),
  CONSTRAINT vsyc_volunteers_minor_guardian_required CHECK (
    is_18_or_older = true
    OR (parent_guardian_name IS NOT NULL AND parent_guardian_phone IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_vsyc_volunteers_status ON vsyc_volunteers (status);
CREATE INDEX IF NOT EXISTS idx_vsyc_volunteers_assigned_role ON vsyc_volunteers (assigned_role);
CREATE INDEX IF NOT EXISTS idx_vsyc_volunteers_role_choice_1 ON vsyc_volunteers (role_choice_1);
CREATE INDEX IF NOT EXISTS idx_vsyc_volunteers_email ON vsyc_volunteers (lower(email));

DROP TRIGGER IF EXISTS vsyc_volunteers_updated_at ON vsyc_volunteers;
CREATE TRIGGER vsyc_volunteers_updated_at
  BEFORE UPDATE ON vsyc_volunteers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE vsyc_volunteers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_volunteers" ON vsyc_volunteers;
CREATE POLICY "service_role_all_volunteers" ON vsyc_volunteers
  FOR ALL USING ((select auth.role()) = 'service_role');
-- No anon policy on vsyc_volunteers itself — contains PII. Public reads only go
-- through vsyc_volunteer_role_availability (aggregate, no PII) below.

-- Confirmed-only fill counts per role, plus judge_pool group totals, for the
-- public /volunteer/roles page and the /api/volunteer-roles endpoint.
DROP VIEW IF EXISTS vsyc_volunteer_role_availability;
CREATE VIEW vsyc_volunteer_role_availability AS
SELECT
  r.role_key,
  r.label,
  r.category,
  r.description,
  r.max_capacity,
  r.group_key,
  r.group_max_capacity,
  r.is_priority,
  r.sort_order,
  COALESCE(role_counts.confirmed_count, 0) AS confirmed_count,
  CASE WHEN r.group_key IS NOT NULL THEN COALESCE(group_counts.group_confirmed_count, 0) END AS group_confirmed_count
FROM vsyc_volunteer_roles r
LEFT JOIN (
  SELECT assigned_role, count(*) AS confirmed_count
  FROM vsyc_volunteers
  WHERE status = 'confirmed' AND assigned_role IS NOT NULL
  GROUP BY assigned_role
) role_counts ON role_counts.assigned_role = r.role_key
LEFT JOIN (
  SELECT vr.group_key, count(*) AS group_confirmed_count
  FROM vsyc_volunteers v
  JOIN vsyc_volunteer_roles vr ON vr.role_key = v.assigned_role
  WHERE v.status = 'confirmed' AND vr.group_key IS NOT NULL
  GROUP BY vr.group_key
) group_counts ON group_counts.group_key = r.group_key
ORDER BY r.sort_order;

-- Match this project's convention (see 0008/0013): views run as the querying
-- user, not the view creator. Only the service-role admin client queries this
-- view (server components / route handlers), so this has no functional effect
-- today, but keeps the security posture consistent if that ever changes.
ALTER VIEW vsyc_volunteer_role_availability SET (security_invoker = true);
