-- Applied to prod 2026-07-05 via Supabase MCP.
DROP VIEW IF EXISTS vsyc_public_profiles;

CREATE VIEW vsyc_public_profiles AS
SELECT
  r.id,
  'competitor'::text AS role,
  COALESCE(r.nickname, r.preferred_bracket_name, r.first_name || ' ' || r.last_name) AS display_name,
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
WHERE s.is_public = true;
