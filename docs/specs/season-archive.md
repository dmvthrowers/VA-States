# Season archive and purge

**Goal.** About a month after a contest, keep what's worth keeping as plain static pages (who
competed, scores, placements, brackets) and delete everything else, so the next season starts
clean and the app holds no old personal data or music.

**Status.** Freeze, verify, purge and reset are built. The retention decisions are made (below). `npm run purge`
is a dry run unless you pass `--apply` plus its safety flags; **nothing has been run against production**, and the
migration it needs (0060) has not been applied.

**Run it** (needs `.env.local` with the Supabase URL and service-role key, read-only use):

```sh
npm run archive -- --season 2026 --site ../dmvthrowers.github.io   # writes archive/2026/
npm run archive:verify -- --season 2026 --site ../dmvthrowers.github.io
```

`--site` reuses that repo's `vsyc26-results.html` for the header, nav and footer so the site stays consistent;
without it you get plain standalone pages. `archive` re-runs its own checks and refuses to write anything that
fails them. Copy the output into the club site repo as a pull request and review it before merging.
Code: `lib/season-archive.ts` (pure, tested) and `scripts/`.

## What is kept (the public record)

Only what the results page already shows publicly, frozen:

- Per division and round: placements, scores, who advanced, and the overall order.
- Brackets: matches, winners, final placements.
- Names by the existing public-name rule (`lib/display-name.ts`, SQL `vsyc_public_name()`): a minor
  who isn't opted into public listing appears as a handle or first name + last initial, never a
  legal name. City and state follow the same rule.
- Links to the recap videos and photos the club site already hosts.

Output: `archive/<season>/` with `index.html`, one page per division, and `results.json` (the
same data, for reuse). It goes to the club site repo (`dmvthrowers.github.io`) as a pull request:
reviewed by a person, never pushed live by the app. No tracking, external fonts or animation, per
the site's rules.

## What is purged

Done by the database function `vsyc_season_purge()` (migration 0060), in one transaction, then the music files.

| Data | Where | Action |
| --- | --- | --- |
| Music tracks | bucket `vsyc26-music` (all but `lofi/`), table `vsyc_music` | delete rows, then objects |
| Scores, judge notes | `vsyc_scores` (and the `vsyc_results` view) | delete |
| Run order, round plans, schedule state, releases | `vsyc_run_order`, `vsyc_round_plans`, `vsyc_schedule_state`, `vsyc_results_releases` | delete |
| Brackets, votes, ladder attempts, side events | `vsyc_bracket_matches`, `vsyc_battle_votes`, `vsyc_ladder_attempts`, `vsyc_side_entries` | delete |
| Teams | `vsyc_teams`, `vsyc_team_members` | delete |
| Registrants, volunteers, spectators | `vsyc_registrations`, `vsyc_volunteers`, `vsyc_spectators` | **anonymize**: names, emails, phones, cities, addresses, guardian and emergency contacts, profiles, tokens, IPs removed. Kept: division, state, age, fees, payment fields, dates, waiver flags |
| Waivers and guardian consent | new `vsyc_consent_records` | written first: who signed (the guardian for a minor), when, and `keep_until` |
| Past champions | new `vsyc_past_champions` | podium and home-state champions, public names only |
| Player accounts | Supabase auth users | **kept**; the season's registration is detached from the account (`auth_user_id` cleared) |
| Survey responses and contacts, outbox | `vsyc26_survey_*`, `email_outbox` | delete |
| Comp codes, event flags | `vsyc_comp_codes`, `vsyc_event_flags` | delete (registrations' codes cleared first); flags fall back to their defaults |
| Contest-day staff accounts | `vsyc_staff_accounts` | deactivate everyone but admins |
| Audit log | `vsyc_audit_log` | **kept**, plus one row of counts (no names). Its retention window is not decided; not purged |
| Payment flags, Stripe events, budget, sponsors, sponsor inquiries | various | **kept** (payment records, books, own retention) |

`npm run purge -- --expire` later deletes consent records past their `keep_until` and anonymized registrations
older than 7 years (the payment-record window).

## Decisions (made)

1. **Payment records:** kept 7 years. The anonymized registration row carries the payment fields.
2. **Waivers and guardian consent:** until the minor turns 21 (counted from their age on contest day, rounded
   up a year so the date is never early); 3 years for adults and spectators; volunteers under 18 are treated as 13.
3. **Registrants:** anonymized after the archive merges; stats kept.
4. **Player accounts:** kept across seasons; each season's data purged.
5. **Past champions:** a small public table, public names only.

Still open: the audit log's retention window (it is not purged until that is decided).

## Process

1. `npm run archive -- --season 2026` **(built)**
   - Reads only through the same code paths the public results page uses (so privacy rules can't
     drift), writes `archive/2026/`, prints a report: counts per division/round/match.
2. `npm run archive:verify` **(built)**
   - Counts in the files match the database; no email, phone, address, birth date or Stripe id
     appears anywhere in the output; every minor not opted in is in restricted form.
3. A person reviews the generated pages and merges the PR in the club site repo.
4. `npm run purge -- --season 2026 --event-date 2026-09-19` **(built)**: dry run by default, prints the counts.
   `--apply` is refused unless: `--archive-url` is live and mentions the season, `--backup-at` is a `db-backup.yml`
   dump from the last 24 hours, `--restore-tested` is passed, and `--confirm "PURGE 2026"` is typed. The database
   function also refuses without that exact confirmation. Safe to run again after a failure.
5. Reset for next season (by hand): `contest.config.ts` (season, dates, divisions, `roundPlan`), `npm run divisions`
   and apply `supabase/divisions.sql`, and a new music bucket name derived from the season (today `vsyc26-music` is
   a constant). Event flags and comp codes are cleared by the purge.

## Safety rules

- Purge never runs from a web request or a cron job; it's a command a person runs, after a backup.
- Everything has a dry run that prints exactly what would go.
- The archive is generated from the database, not from the live site, so a purge can't remove
  something the archive needed.
- The same tooling ships in `yoyo-registration-template` so any club can run its own rollover.
