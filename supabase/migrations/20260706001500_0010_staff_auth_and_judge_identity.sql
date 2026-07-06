-- Staff account model for judge/DJ authentication and per-user scoring identity.

CREATE TABLE IF NOT EXISTS vsyc_staff_accounts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  auth_user_id uuid NOT NULL UNIQUE,
  role         text NOT NULL CHECK (role IN ('judge', 'dj', 'audio_tech', 'admin')),
  display_name text NOT NULL,
  is_active    boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_vsyc_staff_role_active
  ON vsyc_staff_accounts (role, is_active);

DROP TRIGGER IF EXISTS vsyc_staff_accounts_updated_at ON vsyc_staff_accounts;
CREATE TRIGGER vsyc_staff_accounts_updated_at
  BEFORE UPDATE ON vsyc_staff_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE vsyc_staff_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_staff_accounts" ON vsyc_staff_accounts;
CREATE POLICY "service_role_all_staff_accounts" ON vsyc_staff_accounts
  FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE vsyc_scores
  ADD COLUMN IF NOT EXISTS judge_user_id uuid,
  ADD COLUMN IF NOT EXISTS judge_display_name text;

UPDATE vsyc_scores
SET judge_display_name = COALESCE(judge_display_name, judge_name)
WHERE judge_display_name IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_vsyc_scores_judge_user'
  ) THEN
    ALTER TABLE vsyc_scores
      ADD CONSTRAINT uq_vsyc_scores_judge_user UNIQUE (registration_id, division, judge_user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vsyc_scores_div_judge_user
  ON vsyc_scores (division, judge_user_id);

DROP VIEW IF EXISTS vsyc_results;
CREATE VIEW vsyc_results AS
SELECT
  s.division,
  COALESCE(s.judge_display_name, s.judge_name) AS judge_name,
  s.judge_user_id,
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
