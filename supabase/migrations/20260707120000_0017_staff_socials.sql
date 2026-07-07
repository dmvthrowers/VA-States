-- Add socials to staff accounts so judges/DJs/admins can show Instagram/TikTok/YouTube
-- on their public profile, same as competitors and spectators. Recreates
-- vsyc_public_profiles to surface the real column instead of a hardcoded '{}'.

ALTER TABLE vsyc_staff_accounts
  ADD COLUMN IF NOT EXISTS socials jsonb NOT NULL DEFAULT '{}'::jsonb;

DROP VIEW IF EXISTS vsyc_public_profiles;

CREATE VIEW vsyc_public_profiles AS
SELECT
  r.id,
  'competitor'::text AS role,
  COALESCE(r.nickname, r.preferred_bracket_name, r.first_name || ' ' || r.last_name) AS display_name,
  r.pronouns AS pronouns,
  r.city,
  r.state,
  r.club_affiliation AS club,
  r.team AS team,
  r.bio AS bio,
  r.photo_url AS photo_url,
  r.socials AS socials,
  r.divisions::text[] AS divisions,
  r.age_bracket AS age_bracket,
  r.is_public AS is_public_default
FROM vsyc_registrations r
WHERE r.paid = true AND r.is_public = true
UNION ALL
SELECT
  s.id,
  'spectator'::text AS role,
  COALESCE(s.nickname, s.first_name || ' ' || s.last_name) AS display_name,
  s.pronouns AS pronouns,
  NULL::text AS city,
  s.state,
  s.club AS club,
  s.team AS team,
  s.bio AS bio,
  s.photo_url AS photo_url,
  s.socials AS socials,
  NULL::text[] AS divisions,
  NULL::text AS age_bracket,
  s.is_public AS is_public_default
FROM vsyc_spectators s
WHERE s.is_public = true
UNION ALL
SELECT
  sa.id,
  sa.role::text AS role,
  sa.display_name AS display_name,
  sa.pronouns AS pronouns,
  NULL::text AS city,
  NULL::text AS state,
  NULL::text AS club,
  NULL::text AS team,
  sa.bio AS bio,
  sa.photo_url AS photo_url,
  sa.socials AS socials,
  NULL::text[] AS divisions,
  NULL::text AS age_bracket,
  sa.is_public_profile AS is_public_default
FROM vsyc_staff_accounts sa
WHERE sa.is_active = true AND sa.is_public_profile = true;

-- Recreating the view drops the security_invoker setting applied in 0013 — reapply it.
ALTER VIEW vsyc_public_profiles SET (security_invoker = true);
