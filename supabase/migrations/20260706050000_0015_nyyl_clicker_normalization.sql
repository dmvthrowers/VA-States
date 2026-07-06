-- ─────────────────────────────────────────────────────────────────────────────
-- Corrects Tech Execution to match the real NYYL method (per
-- https://yoyocontest.com/freestyle-rules-for-nyyl-events/#technical-execution):
--
-- Judges tally a RAW net clicker score during the routine (+ for landed trick
-- elements weighted by difficulty, - for misses/lost control) — NOT a direct
-- 0-60 estimate. Each judge's raw scores are then normalized per division:
-- their own highest scorer gets the division cap, everyone else scales
-- proportionally. Judges' normalized totals are averaged across judges
-- (already handled by existing standings aggregation).
--
-- Division caps: 1A / X = 60, SBJ ("Sport Freestyle") = 20, no deductions,
-- and no negative raw clicks (enforced in the app layer).
--
-- Major deductions become fixed-value counts, not free-entry points:
--   Stop -1 each, Discard -3 each, Detach -5 each (renamed from "Cut").
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE vsyc_scores RENAME COLUMN tech_execution TO tech_execution_raw;
ALTER TABLE vsyc_scores DROP CONSTRAINT IF EXISTS vsyc_scores_tech_execution_check;
ALTER TABLE vsyc_scores
  ALTER COLUMN tech_execution_raw TYPE numeric(6,2),
  ADD CONSTRAINT vsyc_scores_tech_execution_raw_check
    CHECK (tech_execution_raw >= -200 AND tech_execution_raw <= 200);

ALTER TABLE vsyc_scores
  ADD COLUMN IF NOT EXISTS stop_count    integer NOT NULL DEFAULT 0 CHECK (stop_count >= 0),
  ADD COLUMN IF NOT EXISTS discard_count integer NOT NULL DEFAULT 0 CHECK (discard_count >= 0),
  ADD COLUMN IF NOT EXISTS detach_count  integer NOT NULL DEFAULT 0 CHECK (detach_count >= 0);

UPDATE vsyc_scores SET stop_count = ROUND(deduction_stop)::integer WHERE deduction_stop > 0;
UPDATE vsyc_scores SET discard_count = ROUND(deduction_discard / 3)::integer WHERE deduction_discard > 0;
UPDATE vsyc_scores SET detach_count = ROUND(deduction_cut / 5)::integer WHERE deduction_cut > 0;

ALTER TABLE vsyc_scores
  DROP COLUMN IF EXISTS deduction_stop,
  DROP COLUMN IF EXISTS deduction_discard,
  DROP COLUMN IF EXISTS deduction_cut;

DROP VIEW IF EXISTS vsyc_results;
CREATE VIEW vsyc_results AS
WITH judge_max AS (
  SELECT
    division,
    COALESCE(judge_user_id::text, judge_name) AS judge_key,
    MAX(tech_execution_raw) FILTER (WHERE tech_execution_raw > 0) AS max_raw
  FROM vsyc_scores
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
  GREATEST(
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
  ) AS final_score,
  s.notes,
  s.created_at
FROM vsyc_scores s
JOIN vsyc_registrations r ON r.id = s.registration_id
LEFT JOIN judge_max jm
  ON jm.division = s.division AND jm.judge_key = COALESCE(s.judge_user_id::text, s.judge_name)
ORDER BY s.division, final_score DESC;
