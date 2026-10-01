-- VSYC-26 post-event feedback surveys.
--
-- vsyc26_survey_responses was created directly in production on 2026-09-21
-- (migration "vsyc26_survey_responses") and never landed in this repo. The
-- CREATE below mirrors it exactly so a fresh database ends up identical; on
-- production it is a no-op.
--
-- Changes on top of the original:
--  * Drop the "anon can insert" policy. Submissions now go through
--    POST /api/survey (rate limited, honeypot, validated against lib/surveys.ts)
--    with the service role, so nothing needs direct anon write access. The
--    table had 0 rows when this was written.
--  * Allow two more survey types: 'winner' (top 3 per division — competitor
--    questions plus prizes) and 'vendor' (sales + vending experience).
--  * Add `source` (email / live / qr / social / direct) so results can be
--    split by how people reached the survey.
--  * Cap payload size so one request can't stuff the table.

CREATE TABLE IF NOT EXISTS public.vsyc26_survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  survey_type text NOT NULL CHECK (survey_type IN ('sponsor','competitor','spectator','volunteer')),
  answers jsonb NOT NULL,
  contact_name text,
  contact_email text,
  allow_quote boolean NOT NULL DEFAULT false,
  quote_text text
);

ALTER TABLE public.vsyc26_survey_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon can insert survey responses" ON public.vsyc26_survey_responses;

ALTER TABLE public.vsyc26_survey_responses
  DROP CONSTRAINT IF EXISTS vsyc26_survey_responses_survey_type_check;
ALTER TABLE public.vsyc26_survey_responses
  ADD CONSTRAINT vsyc26_survey_responses_survey_type_check
  CHECK (survey_type IN ('competitor','winner','spectator','volunteer','vendor','sponsor'));

ALTER TABLE public.vsyc26_survey_responses
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'direct';

ALTER TABLE public.vsyc26_survey_responses
  DROP CONSTRAINT IF EXISTS vsyc26_survey_responses_source_check;
ALTER TABLE public.vsyc26_survey_responses
  ADD CONSTRAINT vsyc26_survey_responses_source_check
  CHECK (source IN ('email','live','qr','social','direct'));

ALTER TABLE public.vsyc26_survey_responses
  DROP CONSTRAINT IF EXISTS vsyc26_survey_responses_size_check;
ALTER TABLE public.vsyc26_survey_responses
  ADD CONSTRAINT vsyc26_survey_responses_size_check
  CHECK (
    pg_column_size(answers) < 32000
    AND coalesce(length(contact_name), 0) <= 120
    AND coalesce(length(contact_email), 0) <= 254
    AND coalesce(length(quote_text), 0) <= 1000
  );

CREATE INDEX IF NOT EXISTS idx_vsyc26_survey_type_created
  ON public.vsyc26_survey_responses (survey_type, created_at DESC);
