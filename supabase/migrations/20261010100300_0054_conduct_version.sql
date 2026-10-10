-- 0054 Code of conduct version (master plan P1): which version of the code each person accepted.
-- Null means they signed up before versions were stored. ADDITIVE: nullable columns, no default, no rewrite of
-- existing rows. Same change as the template's 0054. Safe to run twice.

alter table public.vsyc_registrations add column if not exists code_of_conduct_version text check (code_of_conduct_version is null or length(code_of_conduct_version) <= 20);
alter table public.vsyc_spectators    add column if not exists code_of_conduct_version text check (code_of_conduct_version is null or length(code_of_conduct_version) <= 20);
alter table public.vsyc_volunteers    add column if not exists code_of_conduct_version text check (code_of_conduct_version is null or length(code_of_conduct_version) <= 20);
