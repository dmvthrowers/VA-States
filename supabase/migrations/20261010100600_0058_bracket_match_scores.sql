-- 0058 Bracket match scores (master plan F1): each side's running score in a bracket match, for divisions that set
-- matchScoring (first to N wins). Null until entered. ADDITIVE: nullable columns. Same change as the template's 0058.
-- Safe to run twice.

alter table public.vsyc_bracket_matches add column if not exists score_a smallint check (score_a is null or score_a >= 0);
alter table public.vsyc_bracket_matches add column if not exists score_b smallint check (score_b is null or score_b >= 0);
