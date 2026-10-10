-- 0059 $0 add-on divisions (master plan R2): a division that re-ranks another division's results, e.g. Girls or
-- Student. Its scoring_format is 'addon'. Widens a check; no data changes, and no division uses the new value
-- until one is added to the config. Same change as the template's 0059. Safe to run twice.

alter table public.vsyc_divisions drop constraint if exists vsyc_divisions_scoring_format_check;
alter table public.vsyc_divisions add constraint vsyc_divisions_scoring_format_check
  check (scoring_format in ('freestyle', 'manual', 'panel', 'ladder', 'bracket', 'showcase', 'addon'));
