# Migration number map: VA-States and the registration template

The `00NN` part of a migration's filename is only a label (Supabase reads the timestamp, not the label; see
`supabase/migrations/README.md`). The two repos used the same label for different things between 0037 and 0049,
because VA-States shipped some changes to live production in smaller steps than the template did. This map says
which label means what in each repo, so a port can find its counterpart. **Never rename an applied migration.**

Both repos start the same through **0036**.

| Label | VA-States (production) | Template |
|---|---|---|
| 0037 | `0037a`–`0037d`: division tables, score and run-order rules, styles column, view helper; the formats, teams and rounds expand step is bundled as `0037d_0041` | `0037_configurable_divisions` |
| 0038 | (none: not in VA-States) | `0038_generic_judge_roles` |
| 0039–0041 | inside `0037d_0041` (0039 formats, teams and rounds; 0040 audience battles; 0041 live schedule and side events) | `0039_formats_teams_rounds`, `0040_audience_battles`, `0041_live_schedule_side_events` |
| 0042 | `0042_formats_contract` (the contract step after the new code shipped) | `0042_music_per_division` |
| 0043 | `0043_music_per_division` | `0043_music_slots` |
| 0044 | `0044_music_slots` | `0044_role_grants` |
| 0045 | `0045_round_plans` | `0045_role_grants_revoked_by` |
| 0046 | `0046_payment_dispute_flags` | `0046_sponsors_and_open_staff_roles` |
| 0047 | `0047_home_state_eligibility` | `0047_module_items` |
| 0048 | `0048_sponsors_and_inquiries` | `0048_sponsor_inquiries` |
| 0049 | `0049_sponsor_form_settings` | `0049_sponsor_form_settings` |
| 0050 | (not used yet) | `0050_round_plans` (same change as VA-States 0045) |
| 0051 | (not used yet) | `0051_payment_dispute_flags` (same change as VA-States 0046) |
| 0052 | `0052_release_checks` (written 2026-10-10, **not applied**) | `0052_release_checks` |
| 0053 | `0053_run_order_draws` (not applied) | `0053_run_order_draws` |
| 0054 | `0054_conduct_version` (not applied) | `0054_conduct_version` |
| 0055 | (skipped: photo and video release optional is an owner decision, build plan 4.10) | `0055_photo_consent_optional` |
| 0056 | `0056_mc_card_fields` (not applied) | `0056_mc_card_fields` |
| 0057 | `0057_open_books` (not applied) | `0057_open_books` |
| 0058 | `0058_bracket_match_scores` (not applied) | `0058_bracket_match_scores` |
| 0059 | `0059_addon_divisions` (not applied) | `0059_addon_divisions` |
| 0060 | `0060_season_purge` (applied 2026-10-10) | (not used yet) |
| 0061 | (skipped: VA-States keeps its forms on the club site) | `0061_form_submissions` |

Same change, different label: music per division and music slots (VA 0043/0044 = template 0042/0043), round plans
(VA 0045 = template 0050), payment dispute flags (VA 0046 = template 0051), sponsor form settings (both 0049).

Only in one repo:
- **Only in the template:** generic judge roles (0038), role grants and the module items tables (template 0044, 0045, 0046, 0047). Build plan 4.2 ports
  roles into VA-States.
- **Only in VA-States:** home-state eligibility (VA 0047). It collects a home address, so the template port waits for an owner
  decision (build plan 4.1, champion rule).

## Rule from here on

1. **Same change, same label.** A migration that both repos get takes the next number above the highest label either repo has used
   (today that is **0062**) in both repos.
2. A repo that does not need it **skips the number** and adds a line to this table, so the labels keep lining up.
3. Pending ports keep the label they already have until they merge, then this table is updated.
4. Table names differ by prefix only: `vsyc_*` in VA-States, `contest_*` in the template. The one exception is the survey table
   (`vsyc26_survey_responses` in VA-States, `contest_survey_responses` in the template). Renaming a production table is not an
   additive change, so it is left for the owner to decide (build plan 4.3).
