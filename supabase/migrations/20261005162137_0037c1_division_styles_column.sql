-- Applied to production 2026-10-05 as part of the 0037 expand step (split so each piece
-- applied on its own; see 20261005170000_0037d_0041_formats_expand.sql for the rest).

alter table public.vsyc_registrations add column division_styles jsonb not null default '{}'::jsonb;
update public.vsyc_registrations
   set division_styles = jsonb_build_object('X', jsonb_build_array(x_substyle::text))
 where x_substyle is not null;
