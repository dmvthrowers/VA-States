-- Confirmed volunteers get 50% off their own VSYC-26 entry fee. When an admin
-- flips a volunteer's status to 'confirmed' (see app/api/admin/volunteers/[id]/route.ts),
-- the app auto-generates a single-use 50%-off row in vsyc_comp_codes and
-- stores the code here for reference/resend. This column is app-managed,
-- not user-submitted.

ALTER TABLE vsyc_volunteers
  ADD COLUMN IF NOT EXISTS comp_code text REFERENCES vsyc_comp_codes (code) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vsyc_volunteers_comp_code
  ON vsyc_volunteers (comp_code) WHERE comp_code IS NOT NULL;
