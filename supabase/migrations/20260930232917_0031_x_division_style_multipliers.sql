-- Applied to production 2026-09-30 (schema_migrations version 20260930232917, name
-- 0031_x_division_style_multipliers). Published VSYC-26 results were unchanged after
-- applying (per-division counts and score sums identical); grants and security_invoker
-- carried over.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- NYYL X Division style multipliers. NYYL multiplies X Division clicker scores
-- by style before normalization: 2A x1.40, 3A x1.50, 4A x1.30, 5A x1.60.
-- https://yoyocontest.com/freestyle-rules-for-nyyl-events/#x-division-championship
--
-- Rebuilds vsyc_results from 0028 with the multiplier applied to the raw tally
-- both in each judge's normalization baseline (judge_max) and in each row's
-- Technical Execution. The style comes from vsyc_registrations.x_substyle; an X
-- entry with no style recorded gets x1.00. Mirrors computeScoreBreakdown() in
-- app/api/scores/route.ts -- keep the two in sync.
--
-- Official-import rows (is_official_import = true) keep using their overrides,
-- so VSYC-26's published results do not change. As of 2026-09-30 every row in
-- vsyc_scores is an official import.
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS vsyc_results;

CREATE VIEW vsyc_results AS
WITH judge_max AS (
  -- Each judge's top raw clicker score after the X Division style multiplier,
  -- so normalization runs on multiplied scores (NYYL: multiply, then normalize).
  SELECT
    s.division,
    COALESCE(s.judge_user_id::text, s.judge_name) AS judge_key,
    MAX(s.tech_execution_raw * (CASE WHEN s.division = 'X' THEN
        CASE r.x_substyle WHEN '2A' THEN 1.40 WHEN '3A' THEN 1.50 WHEN '4A' THEN 1.30 WHEN '5A' THEN 1.60 ELSE 1.00 END
      ELSE 1.00 END)) FILTER (WHERE s.tech_execution_raw > 0) AS max_raw
  FROM vsyc_scores s
  JOIN vsyc_registrations r ON r.id = s.registration_id
  WHERE s.is_official_import = false
  GROUP BY s.division, COALESCE(s.judge_user_id::text, s.judge_name)
)
SELECT
  s.division,
  COALESCE(s.judge_display_name, s.judge_name) AS judge_name,
  s.judge_user_id,
  r.id            AS registration_id,
  CASE
    WHEN r.is_minor AND NOT r.is_public THEN
      COALESCE(
        NULLIF(TRIM(r.nickname), ''),
        CASE
          WHEN r.preferred_bracket_name IS NOT NULL
               AND LOWER(TRIM(r.preferred_bracket_name)) <> LOWER(TRIM(r.first_name || ' ' || r.last_name))
          THEN r.preferred_bracket_name
        END,
        r.first_name || ' ' || LEFT(r.last_name, 1) || '.'
      )
    ELSE COALESCE(r.preferred_bracket_name, r.first_name || ' ' || r.last_name)
  END AS display_name,
  CASE WHEN r.is_minor AND NOT r.is_public THEN NULL ELSE r.city END AS city,
  r.state,
  r.is_public,
  CASE WHEN r.is_public THEN r.socials ELSE '{}'::jsonb END AS socials,
  s.tech_execution_raw,
  CASE WHEN s.division = 'X' THEN
      CASE r.x_substyle WHEN '2A' THEN 1.40 WHEN '3A' THEN 1.50 WHEN '4A' THEN 1.30 WHEN '5A' THEN 1.60 ELSE 1.00 END
    ELSE 1.00 END AS style_multiplier,
  CASE WHEN s.division = 'SBJ' THEN 20 ELSE 60 END AS tech_execution_cap,
  CASE
    WHEN s.is_official_import THEN s.tech_execution_override
    WHEN jm.max_raw IS NULL OR s.tech_execution_raw <= 0 THEN 0
    ELSE LEAST(
      CASE WHEN s.division = 'SBJ' THEN 20 ELSE 60 END,
      ROUND(((s.tech_execution_raw * (CASE WHEN s.division = 'X' THEN   CASE r.x_substyle WHEN '2A' THEN 1.40 WHEN '3A' THEN 1.50 WHEN '4A' THEN 1.30 WHEN '5A' THEN 1.60 ELSE 1.00 END  ELSE 1.00 END)) / jm.max_raw) * (CASE WHEN s.division = 'SBJ' THEN 20 ELSE 60 END), 2)
    )
  END AS tech_execution_normalized,
  s.trick_presentation,
  s.performance_quality,
  s.musicality,
  s.routine_construction,
  ROUND(s.trick_presentation + s.performance_quality + s.musicality + s.routine_construction, 2) AS total_eval,
  s.stop_count,
  s.discard_count,
  s.detach_count,
  CASE WHEN s.division = 'SBJ' THEN 0 ELSE s.stop_count * 1 + s.discard_count * 3 + s.detach_count * 5 END AS deduction_points,
  CASE
    WHEN s.is_official_import THEN s.final_score_override
    ELSE GREATEST(
      0,
      ROUND(
        (CASE
          WHEN jm.max_raw IS NULL OR s.tech_execution_raw <= 0 THEN 0
          ELSE LEAST(
            CASE WHEN s.division = 'SBJ' THEN 20 ELSE 60 END,
            ((s.tech_execution_raw * (CASE WHEN s.division = 'X' THEN   CASE r.x_substyle WHEN '2A' THEN 1.40 WHEN '3A' THEN 1.50 WHEN '4A' THEN 1.30 WHEN '5A' THEN 1.60 ELSE 1.00 END  ELSE 1.00 END)) / jm.max_raw) * (CASE WHEN s.division = 'SBJ' THEN 20 ELSE 60 END)
          )
        END)
        + s.trick_presentation + s.performance_quality + s.musicality + s.routine_construction
        - (CASE WHEN s.division = 'SBJ' THEN 0 ELSE s.stop_count * 1 + s.discard_count * 3 + s.detach_count * 5 END),
        2
      )
    )
  END AS final_score,
  s.notes,
  s.created_at
FROM vsyc_scores s
JOIN vsyc_registrations r ON r.id = s.registration_id
LEFT JOIN judge_max jm
  ON jm.division = s.division AND jm.judge_key = COALESCE(s.judge_user_id::text, s.judge_name)
ORDER BY s.division, final_score DESC;

ALTER VIEW vsyc_results SET (security_invoker = true);
