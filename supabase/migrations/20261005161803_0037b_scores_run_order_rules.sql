-- Applied to production 2026-10-05 as part of the 0037 expand step (split so each piece
-- applied on its own; see 20261005170000_0037d_0041_formats_expand.sql for the rest).

alter table public.vsyc_run_order drop constraint if exists vsyc_run_order_division_check;
alter table public.vsyc_run_order
  add constraint vsyc_run_order_division_fkey foreign key (division)
  references public.vsyc_divisions (code) on update cascade;

alter table public.vsyc_scores drop constraint if exists vsyc_scores_trick_presentation_check;
alter table public.vsyc_scores drop constraint if exists vsyc_scores_performance_quality_check;
alter table public.vsyc_scores drop constraint if exists vsyc_scores_musicality_check;
alter table public.vsyc_scores drop constraint if exists vsyc_scores_routine_construction_check;
alter table public.vsyc_scores
  add constraint vsyc_scores_division_fkey foreign key (division)
  references public.vsyc_divisions (code) on update cascade;
alter table public.vsyc_scores add column style_code text;
alter table public.vsyc_scores add column manual_score numeric(7,2) check (manual_score >= 0);
alter table public.vsyc_scores
  add constraint vsyc_scores_eval_nonnegative check (
    trick_presentation >= 0 and performance_quality >= 0 and musicality >= 0 and routine_construction >= 0);

-- Ranges depend on the division: eval categories ≤ eval_cap, manual_score ≤ manual_max,
-- no negative clicks where the division doesn't allow them, style must exist.
create function public.vsyc_check_score() returns trigger
language plpgsql set search_path = '' as $$
declare
  d public.vsyc_divisions;
begin
  if new.is_official_import then
    return new;
  end if;
  select * into d from public.vsyc_divisions where code = new.division;
  if d.scoring_format = 'freestyle' then
    if greatest(new.trick_presentation, new.performance_quality, new.musicality, new.routine_construction) > d.eval_cap then
      raise exception 'Evaluation categories in % are scored out of %', d.code, d.eval_cap using errcode = '23514';
    end if;
    if not d.allow_negative and new.tech_execution_raw < 0 then
      raise exception '% does not use negative clicks', d.code using errcode = '23514';
    end if;
  elsif new.manual_score is not null and new.manual_score > d.manual_max then
    raise exception '% is scored out of %', d.code, d.manual_max using errcode = '23514';
  end if;
  if new.style_code is not null and not exists (
       select 1 from public.vsyc_division_styles s where s.division_code = new.division and s.code = new.style_code) then
    raise exception 'Unknown style % for %', new.style_code, new.division using errcode = '23514';
  end if;
  return new;
end $$;

create trigger vsyc_scores_check before insert or update on public.vsyc_scores
  for each row execute function public.vsyc_check_score();

