-- Runtime event flags to allow admin-controlled behavior changes without redeploys.

CREATE TABLE IF NOT EXISTS vsyc_event_flags (
  key        text PRIMARY KEY,
  value_bool boolean,
  value_text text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vsyc_event_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_event_flags" ON vsyc_event_flags;
CREATE POLICY "service_role_all_event_flags" ON vsyc_event_flags
  FOR ALL USING (auth.role() = 'service_role');

INSERT INTO vsyc_event_flags (key, value_bool)
VALUES
  ('results_published', false),
  ('online_registration_open', true)
ON CONFLICT (key) DO NOTHING;
