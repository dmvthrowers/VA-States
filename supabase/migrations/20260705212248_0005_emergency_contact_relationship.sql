-- Applied to prod 2026-07-05 via Supabase MCP.
ALTER TABLE vsyc_registrations
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship text;
