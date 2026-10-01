-- ─────────────────────────────────────────────────────────────────────────────
-- VSYC-26 Day-of Operations: Run Order + Scoring
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Scheduling columns on existing registrations table
ALTER TABLE vsyc_registrations
  ADD COLUMN IF NOT EXISTS performance_time_pref text,
  ADD COLUMN IF NOT EXISTS scheduling_notes       text,
  ADD COLUMN IF NOT EXISTS music_filename         text;  -- stored filename in vsyc26-music bucket

-- 2. Performance run order per division
CREATE TABLE IF NOT EXISTS vsyc_run_order (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  division        text        NOT NULL CHECK (division IN ('1A','X','SBJ')),
  registration_id uuid        NOT NULL REFERENCES vsyc_registrations(id) ON DELETE CASCADE,
  position        integer     NOT NULL,
  status          text        NOT NULL DEFAULT 'upcoming'
                              CHECK (status IN ('upcoming','performing','done')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (division, registration_id),
  UNIQUE (division, position)
);

CREATE INDEX IF NOT EXISTS vsyc_run_order_div_pos
  ON vsyc_run_order (division, position);

CREATE INDEX IF NOT EXISTS vsyc_run_order_div_status
  ON vsyc_run_order (division, status);

-- 3. Judge scores per competitor per division
CREATE TABLE IF NOT EXISTS vsyc_scores (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid         NOT NULL REFERENCES vsyc_registrations(id) ON DELETE CASCADE,
  division        text         NOT NULL,
  judge_name      text         NOT NULL,
  execution       numeric(6,2) NOT NULL DEFAULT 0
                               CHECK (execution  >= 0 AND execution  <= 100),
  difficulty      numeric(6,2) NOT NULL DEFAULT 0
                               CHECK (difficulty >= 0 AND difficulty <= 100),
  presentation    numeric(6,2) NOT NULL DEFAULT 0
                               CHECK (presentation >= 0 AND presentation <= 100),
  notes           text,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (registration_id, division, judge_name)
);

CREATE INDEX IF NOT EXISTS vsyc_scores_div
  ON vsyc_scores (division);

-- 4. Convenience view: scores with competitor names and totals
CREATE OR REPLACE VIEW vsyc_results AS
SELECT
  s.division,
  s.judge_name,
  r.id            AS registration_id,
  COALESCE(r.preferred_bracket_name, r.first_name || ' ' || r.last_name) AS display_name,
  r.city,
  r.state,
  s.execution,
  s.difficulty,
  s.presentation,
  ROUND(s.execution + s.difficulty + s.presentation, 2) AS total,
  s.notes,
  s.created_at
FROM vsyc_scores s
JOIN vsyc_registrations r ON r.id = s.registration_id
ORDER BY s.division, total DESC;
