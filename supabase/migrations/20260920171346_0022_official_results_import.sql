-- Replay fix (build plan 4.2): drop views rebuilt below before altering the columns they read, so this
-- migration replays on a fresh database. A no-op on a database that already applied it.
DROP VIEW IF EXISTS vsyc_results;

-- Applied to production 2026-09-20 (schema_migrations version 20260920171346, name 0022_official_results_import).
-- Copied into the repo 2026-09-23 so the repo matches prod; SQL is verbatim from
-- supabase_migrations.schema_migrations.

ALTER TABLE vsyc_scores
  ADD COLUMN IF NOT EXISTS is_official_import boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tech_execution_override numeric(6,2),
  ADD COLUMN IF NOT EXISTS final_score_override numeric(6,2);

COMMENT ON COLUMN vsyc_scores.is_official_import IS 'True for reconciled/official results entered directly (e.g. from an external scoring sheet) rather than live judge clicker input. When true, vsyc_results uses tech_execution_override / final_score_override verbatim instead of recomputing via per-judge raw/max normalization.';

DROP VIEW IF EXISTS vsyc_results;
CREATE VIEW vsyc_results AS
WITH judge_max AS (
  SELECT
    division,
    COALESCE(judge_user_id::text, judge_name) AS judge_key,
    MAX(tech_execution_raw) FILTER (WHERE tech_execution_raw > 0) AS max_raw
  FROM vsyc_scores
  WHERE is_official_import = false
  GROUP BY division, COALESCE(judge_user_id::text, judge_name)
)
SELECT
  s.division,
  COALESCE(s.judge_display_name, s.judge_name) AS judge_name,
  s.judge_user_id,
  r.id            AS registration_id,
  COALESCE(r.preferred_bracket_name, r.first_name || ' ' || r.last_name) AS display_name,
  r.city,
  r.state,
  s.tech_execution_raw,
  CASE WHEN s.division = 'SBJ' THEN 20 ELSE 60 END AS tech_execution_cap,
  CASE
    WHEN s.is_official_import THEN s.tech_execution_override
    WHEN jm.max_raw IS NULL OR s.tech_execution_raw <= 0 THEN 0
    ELSE LEAST(
      CASE WHEN s.division = 'SBJ' THEN 20 ELSE 60 END,
      ROUND((s.tech_execution_raw / jm.max_raw) * (CASE WHEN s.division = 'SBJ' THEN 20 ELSE 60 END), 2)
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
            (s.tech_execution_raw / jm.max_raw) * (CASE WHEN s.division = 'SBJ' THEN 20 ELSE 60 END)
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
