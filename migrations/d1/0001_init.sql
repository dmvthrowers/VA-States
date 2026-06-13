-- VSYC-26 Registration — D1 (SQLite) schema.
-- Translated from the legacy Supabase/Postgres migrations (supabase/migrations/).
-- Conventions:
--   * uuids generated in the app (crypto.randomUUID()), stored as TEXT
--   * booleans stored as INTEGER 0/1
--   * timestamps stored as ISO 8601 UTC TEXT (lexicographically comparable)
--   * divisions stored as a JSON array TEXT, e.g. '["1A","X"]'

-- ========== COMP CODES ==========
CREATE TABLE vsyc_comp_codes (
  code        TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  max_uses    INTEGER NOT NULL DEFAULT 1,
  uses_count  INTEGER NOT NULL DEFAULT 0,
  expires_at  TEXT NOT NULL DEFAULT '2026-09-13T03:59:59.000Z',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

-- ========== REGISTRATIONS ==========
CREATE TABLE vsyc_registrations (
  id                        TEXT PRIMARY KEY,
  created_at                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  -- Player info
  first_name                TEXT NOT NULL,
  last_name                 TEXT NOT NULL,
  preferred_bracket_name    TEXT,
  age_on_event              INTEGER NOT NULL,
  pronouns                  TEXT,
  email                     TEXT NOT NULL,
  phone                     TEXT,
  city                      TEXT NOT NULL,
  state                     TEXT NOT NULL,
  club_affiliation          TEXT,

  -- Minor consent (is_minor computed from age_on_event)
  is_minor                  INTEGER GENERATED ALWAYS AS (age_on_event < 18) STORED,
  parent_name               TEXT,
  parent_email              TEXT,
  parent_consented          INTEGER DEFAULT 0,

  -- Divisions (JSON array of '1A' | 'X' | 'SBJ')
  divisions                 TEXT NOT NULL CHECK (json_valid(divisions) AND json_array_length(divisions) >= 1),
  x_substyle                TEXT CHECK (x_substyle IN ('2A','3A','4A','5A')),
  combo_applied             INTEGER NOT NULL DEFAULT 0,

  -- Pricing
  comp_code                 TEXT REFERENCES vsyc_comp_codes(code),
  early_bird_applied        INTEGER NOT NULL DEFAULT 0,
  walk_up_surcharge         INTEGER NOT NULL DEFAULT 0,
  fee_cents                 INTEGER NOT NULL,
  registration_source       TEXT NOT NULL DEFAULT 'online'
                            CHECK (registration_source IN ('online','late_email','walk_up','soft_launch')),

  -- Music
  music_path                TEXT,
  music_filename            TEXT,
  music_uploaded_at         TEXT,
  music_upload_token        TEXT UNIQUE,

  -- Waivers (all required true to submit — enforced in DB and API)
  liability_waiver_accepted INTEGER NOT NULL,
  photo_video_consent       INTEGER NOT NULL,
  code_of_conduct_accepted  INTEGER NOT NULL,

  -- Optional
  emergency_contact_name    TEXT,
  emergency_contact_phone   TEXT,
  volunteer_interest        INTEGER DEFAULT 0,
  accessibility_needs       TEXT,
  performance_time_pref     TEXT,
  scheduling_notes          TEXT,
  merch_order               TEXT,
  merch_total_cents         INTEGER DEFAULT 0,

  -- Admin
  paid                      INTEGER NOT NULL DEFAULT 0,
  paid_at                   TEXT,
  payment_method            TEXT DEFAULT 'pending'
                            CHECK (payment_method IN ('venmo','paypal','check','cash','comp','pending')),
  bracket_seed              INTEGER,
  admin_notes               TEXT,

  -- Audit
  ip_address                TEXT,
  user_agent                TEXT,

  -- Constraints
  CONSTRAINT minor_requires_parent CHECK (
    (age_on_event >= 18) OR
    (parent_name IS NOT NULL AND parent_email IS NOT NULL AND parent_consented = 1)
  ),
  CONSTRAINT x_requires_substyle CHECK (
    instr(divisions, '"X"') = 0 OR x_substyle IS NOT NULL
  ),
  CONSTRAINT waivers_required CHECK (
    liability_waiver_accepted = 1
    AND photo_video_consent = 1
    AND code_of_conduct_accepted = 1
  )
);

CREATE INDEX idx_vsyc_email   ON vsyc_registrations (lower(email));
CREATE INDEX idx_vsyc_paid    ON vsyc_registrations (paid);
CREATE INDEX idx_vsyc_created ON vsyc_registrations (created_at DESC);
CREATE INDEX idx_vsyc_token   ON vsyc_registrations (music_upload_token);

CREATE TRIGGER vsyc_registrations_updated_at
AFTER UPDATE ON vsyc_registrations
BEGIN
  UPDATE vsyc_registrations
  SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id = NEW.id;
END;

-- ========== AUDIT LOG ==========
CREATE TABLE vsyc_audit_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  registration_id TEXT REFERENCES vsyc_registrations(id) ON DELETE SET NULL,
  actor           TEXT NOT NULL,
  action          TEXT NOT NULL,
  details         TEXT
);

CREATE INDEX idx_audit_registration ON vsyc_audit_log (registration_id);
CREATE INDEX idx_audit_created      ON vsyc_audit_log (created_at DESC);

-- ========== RUN ORDER ==========
CREATE TABLE vsyc_run_order (
  id              TEXT PRIMARY KEY,
  division        TEXT NOT NULL CHECK (division IN ('1A','X','SBJ')),
  registration_id TEXT NOT NULL REFERENCES vsyc_registrations(id) ON DELETE CASCADE,
  position        INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'upcoming'
                  CHECK (status IN ('upcoming','performing','done')),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (division, registration_id),
  UNIQUE (division, position)
);

CREATE INDEX vsyc_run_order_div_pos    ON vsyc_run_order (division, position);
CREATE INDEX vsyc_run_order_div_status ON vsyc_run_order (division, status);

-- ========== SCORES ==========
CREATE TABLE vsyc_scores (
  id              TEXT PRIMARY KEY,
  registration_id TEXT NOT NULL REFERENCES vsyc_registrations(id) ON DELETE CASCADE,
  division        TEXT NOT NULL CHECK (division IN ('1A','X','SBJ')),
  judge_name      TEXT NOT NULL,
  execution       REAL NOT NULL DEFAULT 0 CHECK (execution    >= 0 AND execution    <= 100),
  difficulty      REAL NOT NULL DEFAULT 0 CHECK (difficulty   >= 0 AND difficulty   <= 100),
  presentation    REAL NOT NULL DEFAULT 0 CHECK (presentation >= 0 AND presentation <= 100),
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (registration_id, division, judge_name)
);

CREATE INDEX vsyc_scores_div ON vsyc_scores (division);

-- Convenience view: scores with competitor names and totals
CREATE VIEW vsyc_results AS
SELECT
  s.division,
  s.judge_name,
  r.id AS registration_id,
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

-- ========== RATE LIMITING ==========
-- Fixed-window counters keyed by action:ip (replaces Upstash/Vercel KV).
CREATE TABLE vsyc_rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);

-- ========== SEED COMP CODES ==========
INSERT INTO vsyc_comp_codes (code, description, max_uses) VALUES
  ('VOLUNTEER26',        'Volunteer comp pass',                              20),
  ('SPONSOR26',          'Generic sponsor comp pass',                        10),
  ('FRESHLY_DIRTY_TEAM', 'Diamond sponsor: Freshly Dirty — 2 free passes',    2);
