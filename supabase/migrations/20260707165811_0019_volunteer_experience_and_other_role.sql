-- Adds:
--  1. A free-form "other_show_talent" role (uncapped) so applicants can
--     propose something we didn't think of (magician, lunch-break band, etc).
--  2. vsyc_volunteers.other_role_description — required whenever that role
--     is chosen, describing what the act/idea actually is.
--  3. A mandatory-experience rule: relevant experience is required for core
--     roles, judges, and the "other" role; optional for the rest.
--
-- NOTE: the CHECK constraints below hardcode role_key lists rather than
-- joining vsyc_volunteer_roles (Postgres CHECK constraints can't reference
-- other tables). The single source of truth for which roles require
-- experience is VOLUNTEER_ROLES/isExperienceRequired() in
-- lib/volunteer-roles.ts — if that catalog changes, update this migration's
-- successor to match. App-level zod validation (lib/validation.ts) is the
-- primary enforcement; these are a DB-level backstop.

ALTER TABLE vsyc_volunteer_roles
  DROP CONSTRAINT IF EXISTS vsyc_volunteer_roles_category_check;
ALTER TABLE vsyc_volunteer_roles
  ADD CONSTRAINT vsyc_volunteer_roles_category_check
  CHECK (category IN ('core', 'judge', 'non_core', 'other'));

ALTER TABLE vsyc_volunteer_roles
  DROP CONSTRAINT IF EXISTS vsyc_volunteer_roles_cap_check;
ALTER TABLE vsyc_volunteer_roles
  ADD CONSTRAINT vsyc_volunteer_roles_cap_check
  CHECK (
    (max_capacity IS NOT NULL AND group_key IS NULL)
    OR (max_capacity IS NULL AND group_key IS NOT NULL AND group_max_capacity IS NOT NULL)
    OR (max_capacity IS NULL AND group_key IS NULL) -- uncapped, e.g. other_show_talent
  );

INSERT INTO vsyc_volunteer_roles (role_key, label, category, description, max_capacity, group_key, group_max_capacity, is_priority, sort_order) VALUES
  ('other_show_talent', 'Other / Show or Talent', 'other', 'Got a talent, act, or idea we did not think of - magician, lunch-break band, something else? Tell us.', NULL, NULL, NULL, false, 400)
ON CONFLICT (role_key) DO UPDATE SET
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  max_capacity = EXCLUDED.max_capacity,
  group_key = EXCLUDED.group_key,
  group_max_capacity = EXCLUDED.group_max_capacity,
  is_priority = EXCLUDED.is_priority,
  sort_order = EXCLUDED.sort_order;

ALTER TABLE vsyc_volunteers
  ADD COLUMN IF NOT EXISTS other_role_description text;

ALTER TABLE vsyc_volunteers
  DROP CONSTRAINT IF EXISTS vsyc_volunteers_other_role_description_required;
ALTER TABLE vsyc_volunteers
  ADD CONSTRAINT vsyc_volunteers_other_role_description_required
  CHECK (
    (role_choice_1 <> 'other_show_talent' AND (role_choice_2 IS NULL OR role_choice_2 <> 'other_show_talent'))
    OR other_role_description IS NOT NULL
  );

ALTER TABLE vsyc_volunteers
  DROP CONSTRAINT IF EXISTS vsyc_volunteers_experience_required;
ALTER TABLE vsyc_volunteers
  ADD CONSTRAINT vsyc_volunteers_experience_required
  CHECK (
    (
      role_choice_1 NOT IN ('dj_audio_tech', 'mc_host', 'streaming', 'sport_division_judge', '1a_pro_judge', 'x_division_judge', 'other_show_talent')
      AND (
        role_choice_2 IS NULL
        OR role_choice_2 NOT IN ('dj_audio_tech', 'mc_host', 'streaming', 'sport_division_judge', '1a_pro_judge', 'x_division_judge', 'other_show_talent')
      )
    )
    OR experience_notes IS NOT NULL
  );
