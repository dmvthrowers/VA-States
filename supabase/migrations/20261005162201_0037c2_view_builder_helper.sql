-- Applied to production 2026-10-05 as part of the 0037 expand step (split so each piece
-- applied on its own; see 20261005170000_0037d_0041_formats_expand.sql for the rest).

-- Holds the view definitions so the view swap in 0037d stays a short statement list.
create function public.vsyc_tmp_create_views_0037() returns void
language plpgsql set search_path = '' as $fn$
begin
execute $v$
create view public.vsyc_public_profiles as
select r.id,
       'competitor'::text as role,
       coalesce(r.nickname, r.preferred_bracket_name, r.first_name || ' ' || r.last_name) as display_name,
       r.pronouns, r.city, r.state, r.club_affiliation as club, r.team, r.bio, r.photo_url, r.socials,
       r.divisions as divisions,
       r.age_bracket,
       r.is_public as is_public_default
  from public.vsyc_registrations r
 where r.paid = true and r.is_public = true
union all
select s.id, 'spectator'::text, coalesce(s.nickname, s.first_name || ' ' || s.last_name),
       s.pronouns, null::text, s.state, s.club, s.team, s.bio, s.photo_url, s.socials,
       null::text[], null::text, s.is_public
  from public.vsyc_spectators s
 where s.is_public = true
union all
select sa.id, sa.role, sa.display_name, sa.pronouns, null::text, null::text, null::text, null::text,
       sa.bio, sa.photo_url, sa.socials, null::text[], null::text, sa.is_public_profile
  from public.vsyc_staff_accounts sa
 where sa.is_active = true and sa.is_public_profile = true
$v$;
execute 'alter view public.vsyc_public_profiles set (security_invoker = true)';
execute $v$
create view public.vsyc_results as
with scored as (
  select s.*,
         r.is_minor, r.is_public, r.nickname, r.preferred_bracket_name, r.first_name, r.last_name,
         r.city as reg_city, r.state as reg_state, r.socials as reg_socials,
         d.scoring_format, d.tech_cap, d.eval_cap, d.stop_points, d.discard_points, d.detach_points, d.manual_max,
         coalesce(st.multiplier, 1.00) as style_multiplier,
         coalesce(s.style_code,
           case when jsonb_typeof(r.division_styles -> s.division) = 'array'
                     and jsonb_array_length(r.division_styles -> s.division) = 1
                then r.division_styles -> s.division ->> 0 end) as effective_style
    from public.vsyc_scores s
    join public.vsyc_registrations r on r.id = s.registration_id
    join public.vsyc_divisions d on d.code = s.division
    left join public.vsyc_division_styles st
      on st.division_code = s.division
     and st.code = coalesce(s.style_code,
           case when jsonb_typeof(r.division_styles -> s.division) = 'array'
                     and jsonb_array_length(r.division_styles -> s.division) = 1
                then r.division_styles -> s.division ->> 0 end)
),
judge_max as (
  -- Each judge's top raw tally after style multipliers: multiply, then normalize.
  select division, coalesce(judge_user_id::text, judge_name) as judge_key,
         max(tech_execution_raw * style_multiplier) filter (where tech_execution_raw > 0) as max_raw
    from scored
   where not is_official_import and scoring_format = 'freestyle'
   group by division, coalesce(judge_user_id::text, judge_name)
),
computed as (
  select sc.*,
         case
           when sc.scoring_format <> 'freestyle' then 0
           when sc.is_official_import then sc.tech_execution_override
           when jm.max_raw is null or sc.tech_execution_raw <= 0 then 0
           else least(sc.tech_cap, round((sc.tech_execution_raw * sc.style_multiplier / jm.max_raw) * sc.tech_cap, 2))
         end as tech_norm,
         case when sc.scoring_format = 'freestyle'
              then sc.stop_count * sc.stop_points + sc.discard_count * sc.discard_points + sc.detach_count * sc.detach_points
              else 0 end as deductions
    from scored sc
    left join judge_max jm
      on jm.division = sc.division and jm.judge_key = coalesce(sc.judge_user_id::text, sc.judge_name)
)
select
  c.division,
  coalesce(c.judge_display_name, c.judge_name) as judge_name,
  c.judge_user_id,
  c.registration_id,
  case
    when c.is_minor and not c.is_public then
      coalesce(
        nullif(trim(c.nickname), ''),
        case
          when c.preferred_bracket_name is not null
               and lower(trim(c.preferred_bracket_name)) <> lower(trim(c.first_name || ' ' || c.last_name))
          then c.preferred_bracket_name
        end,
        c.first_name || ' ' || left(c.last_name, 1) || '.'
      )
    else coalesce(c.preferred_bracket_name, c.first_name || ' ' || c.last_name)
  end as display_name,
  case when c.is_minor and not c.is_public then null else c.reg_city end as city,
  c.reg_state as state,
  c.is_public,
  case when c.is_public then c.reg_socials else '{}'::jsonb end as socials,
  c.scoring_format,
  c.effective_style as style_code,
  c.tech_execution_raw,
  c.style_multiplier,
  c.tech_cap as tech_execution_cap,
  c.tech_norm as tech_execution_normalized,
  c.trick_presentation,
  c.performance_quality,
  c.musicality,
  c.routine_construction,
  round(c.trick_presentation + c.performance_quality + c.musicality + c.routine_construction, 2) as total_eval,
  c.stop_count,
  c.discard_count,
  c.detach_count,
  c.deductions as deduction_points,
  c.manual_score,
  case
    when c.is_official_import then c.final_score_override
    when c.scoring_format = 'manual' then least(c.manual_max, greatest(0, round(coalesce(c.manual_score, 0), 2)))
    else greatest(0, round(c.tech_norm + c.trick_presentation + c.performance_quality + c.musicality + c.routine_construction - c.deductions, 2))
  end as final_score,
  c.notes,
  c.created_at
from computed c
order by c.division, final_score desc
$v$;
execute 'alter view public.vsyc_results set (security_invoker = true)';
end $fn$;
