-- Results data gaps (roadmap item 12, build plan 4.20). READ-ONLY: every statement is a SELECT.
-- Run in the Supabase SQL editor (or psql) against the production database and send back the output.
-- It looks for the causes of what showed on /results on Oct 2: 1A missing ranks 1-9, X Division without rank
-- numbers, two scores without a competitor name, and some missing scores and cities.
-- It prints counts and ids only, never emails, phones or addresses. Names are printed only where the question is
-- "is the name blank?", and those rows show the registration id instead.

-- 1. The shape of each division: rows, people, official-import rows, and rows with no usable final score.
select s.division,
       count(*)                                                        as score_rows,
       count(distinct s.registration_id)                               as people,
       count(*) filter (where s.is_official_import)                    as official_import_rows,
       count(*) filter (where s.is_official_import and s.final_score_override is null) as import_rows_without_final_score,
       count(*) filter (where s.is_official_import and s.tech_execution_override is null) as import_rows_without_tech_execution
from vsyc_scores s
group by s.division order by s.division;

-- 2. The same view the public page reads (vsyc_results): rows whose final score is null or zero.
select division,
       count(*) filter (where final_score is null) as final_score_null,
       count(*) filter (where final_score = 0)     as final_score_zero,
       count(*)                                    as rows
from vsyc_results group by division order by division;

-- 3. "Two scores without a competitor name": a blank display name, which happens when a registration's
--    preferred_bracket_name is an empty string (COALESCE only skips NULL). Shown by registration id.
select r.id as registration_id, r.is_minor,
       (r.preferred_bracket_name is not null and btrim(r.preferred_bracket_name) = '') as bracket_name_is_blank_string,
       (btrim(coalesce(r.first_name, '')) = '' and btrim(coalesce(r.last_name, '')) = '') as legal_name_blank,
       (select count(*) from vsyc_scores s where s.registration_id = r.id) as score_rows
from vsyc_registrations r
where (r.preferred_bracket_name is not null and btrim(r.preferred_bracket_name) = '')
   or (btrim(coalesce(r.first_name, '')) = '' and btrim(coalesce(r.last_name, '')) = '')
order by score_rows desc;

-- 4. Missing city or state on people who have scores (the public page shows "city, state").
select r.id as registration_id, r.is_minor,
       (btrim(coalesce(r.city, '')) = '')  as city_blank,
       (btrim(coalesce(r.state, '')) = '') as state_blank
from vsyc_registrations r
where exists (select 1 from vsyc_scores s where s.registration_id = r.id)
  and (btrim(coalesce(r.city, '')) = '' or btrim(coalesce(r.state, '')) = '')
order by r.id;

-- 5. Rows that could confuse ranking: the same person scored twice by the same judge in one round, and import
--    rows mixed with live judge rows in one division.
select division, round, registration_id, coalesce(judge_user_id::text, judge_name) as judge_key, count(*) as rows
from vsyc_scores group by division, round, registration_id, coalesce(judge_user_id::text, judge_name)
having count(*) > 1 order by division, round;

select division,
       count(*) filter (where is_official_import)     as import_rows,
       count(*) filter (where not is_official_import) as live_rows
from vsyc_scores group by division having count(*) filter (where is_official_import) > 0 and count(*) filter (where not is_official_import) > 0;

-- 6. Rank check, the way the public page orders a division: average of final_score per person per round, with ties
--    sharing a place. A division whose top rows have a null or zero average will show the "missing ranks".
with per_person as (
  select division, round, registration_id, round(avg(coalesce(final_score, 0))::numeric, 2) as avg_final, count(*) as judges
  from vsyc_results
  group by division, round, registration_id
)
select division, round, rank() over (partition by division, round order by avg_final desc) as place, registration_id, avg_final, judges
from per_person
order by division, round, place
limit 200;
