-- ─────────────────────────────────────────────────────────────────────────────
-- Switch judge scoring from the old 3-category (execution/difficulty/
-- presentation, /300) model to the NYYL rubric:
--   Tech Execution        /60
--   Trick Presentation    /10
--   Performance Quality   /10
--   Musicality            /10
--   Routine Construction  /10
--   Total Eval = TP+PQ+MU+RC                    (/40)
--   Subtotal   = Tech Execution + Total Eval     (/100)
--   Major Deductions: Stop / Discard / Cut (points subtracted from Subtotal)
--   Final Score = Subtotal - deductions, floored at 0
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE vsyc_scores
  ADD COLUMN IF NOT EXISTS tech_execution       numeric(5,2) NOT NULL DEFAULT 0
                           CHECK (tech_execution >= 0 AND tech_execution <= 60),
  ADD COLUMN IF NOT EXISTS trick_presentation    numeric(4,2) NOT NULL DEFAULT 0
                           CHECK (trick_presentation >= 0 AND trick_presentation <= 10),
  ADD COLUMN IF NOT EXISTS performance_quality   numeric(4,2) NOT NULL DEFAULT 0
                           CHECK (performance_quality >= 0 AND performance_quality <= 10),
  ADD COLUMN IF NOT EXISTS musicality            numeric(4,2) NOT NULL DEFAULT 0
                           CHECK (musicality >= 0 AND musicality <= 10),
  ADD COLUMN IF NOT EXISTS routine_construction  numeric(4,2) NOT NULL DEFAULT 0
                           CHECK (routine_construction >= 0 AND routine_construction <= 10),
  ADD COLUMN IF NOT EXISTS deduction_stop        numeric(4,2) NOT NULL DEFAULT 0
                           CHECK (deduction_stop >= 0),
  ADD COLUMN IF NOT EXISTS deduction_discard     numeric(4,2) NOT NULL DEFAULT 0
                           CHECK (deduction_discard >= 0),
  ADD COLUMN IF NOT EXISTS deduction_cut         numeric(4,2) NOT NULL DEFAULT 0
                           CHECK (deduction_cut >= 0);

ALTER TABLE vsyc_scores
  DROP COLUMN IF EXISTS execution,
  DROP COLUMN IF EXISTS difficulty,
  DROP COLUMN IF EXISTS presentation;

DROP VIEW IF EXISTS vsyc_results;
CREATE VIEW vsyc_results AS
SELECT
  s.division,
  COALESCE(s.judge_display_name, s.judge_name) AS judge_name,
  s.judge_user_id,
  r.id            AS registration_id,
  COALESCE(r.preferred_bracket_name, r.first_name || ' ' || r.last_name) AS display_name,
  r.city,
  r.state,
  s.tech_execution,
  s.trick_presentation,
  s.performance_quality,
  s.musicality,
  s.routine_construction,
  ROUND(s.trick_presentation + s.performance_quality + s.musicality + s.routine_construction, 2) AS total_eval,
  ROUND(s.tech_execution + s.trick_presentation + s.performance_quality + s.musicality + s.routine_construction, 2) AS subtotal,
  s.deduction_stop,
  s.deduction_discard,
  s.deduction_cut,
  GREATEST(
    0,
    ROUND(
      s.tech_execution + s.trick_presentation + s.performance_quality + s.musicality + s.routine_construction
      - s.deduction_stop - s.deduction_discard - s.deduction_cut,
      2
    )
  ) AS final_score,
  s.notes,
  s.created_at
FROM vsyc_scores s
JOIN vsyc_registrations r ON r.id = s.registration_id
ORDER BY s.division, final_score DESC;
