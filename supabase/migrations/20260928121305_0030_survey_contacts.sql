-- Sponsor and vendor contacts for the post-event survey emails.
--
-- Competitors, spectators and volunteers come from their own tables; sponsors
-- and vendors never registered anywhere, so their survey invites went out by
-- hand. This table lets the admin Surveys tab email (and remind) them like any
-- other audience.
--
-- The repo is public: contact rows live only in the database, never in a
-- migration or seed file. Service role only (RLS on, no policies).

CREATE TABLE IF NOT EXISTS public.vsyc26_survey_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  audience text NOT NULL CHECK (audience IN ('sponsor','vendor')),
  org text NOT NULL CHECK (char_length(org) BETWEEN 1 AND 120),
  first_name text NOT NULL CHECK (char_length(first_name) BETWEEN 1 AND 80),
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  cc text[] NOT NULL DEFAULT '{}' CHECK (cardinality(cc) <= 5)
);

CREATE UNIQUE INDEX IF NOT EXISTS vsyc26_survey_contacts_audience_email_key
  ON public.vsyc26_survey_contacts (audience, lower(email));

ALTER TABLE public.vsyc26_survey_contacts ENABLE ROW LEVEL SECURITY;
