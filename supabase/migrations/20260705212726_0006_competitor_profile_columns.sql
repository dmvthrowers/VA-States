-- Applied to prod 2026-07-05 via Supabase MCP.
ALTER TABLE vsyc_registrations
  ADD COLUMN IF NOT EXISTS nickname      text,
  ADD COLUMN IF NOT EXISTS photo_url     text,
  ADD COLUMN IF NOT EXISTS bio           text,
  ADD COLUMN IF NOT EXISTS team          text,
  ADD COLUMN IF NOT EXISTS yoyo          text,
  ADD COLUMN IF NOT EXISTS string        text,
  ADD COLUMN IF NOT EXISTS counterweight text,
  ADD COLUMN IF NOT EXISTS socials       jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_public     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS age_bracket   text GENERATED ALWAYS AS (
    CASE
      WHEN age_on_event < 18 THEN 'under_18'
      WHEN age_on_event BETWEEN 18 AND 39 THEN '18_39'
      ELSE '40_plus'
    END
  ) STORED;
