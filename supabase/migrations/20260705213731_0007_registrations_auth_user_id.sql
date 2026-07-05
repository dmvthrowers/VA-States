-- Applied to prod 2026-07-05 via Supabase MCP.
-- Prep for player self-service login (Supabase Auth magic link) — not yet wired in app code.
ALTER TABLE vsyc_registrations
  ADD COLUMN IF NOT EXISTS auth_user_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vsyc_registrations_auth_user
  ON vsyc_registrations (auth_user_id) WHERE auth_user_id IS NOT NULL;
