# Season archive and purge

**Goal.** About a month after a contest, keep what's worth keeping as plain static pages (who
competed, scores, placements, brackets) and delete everything else, so the next season starts
clean and the app holds no old personal data or music.

**Status.** Planned, not built. Decisions marked **(you)** need an owner answer before building.

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

| Data | Where | Action |
| --- | --- | --- |
| Music tracks | bucket `vsyc26-music` (all but `lofi/`), table `vsyc_music` | delete objects, then rows |
| Scores, judge notes | `vsyc_scores`, `vsyc_results` | delete |
| Run order, round plans, schedule state | `vsyc_run_order`, `vsyc_round_plans`, schedule tables | delete |
| Brackets and votes | `vsyc_bracket_matches`, `vsyc_battle_votes` | delete |
| Teams | `vsyc_teams`, `vsyc_team_members` | delete |
| Registrants and profiles | `vsyc_registrations` and dependants (emails, addresses, guardian info) | delete or anonymize **(you)** |
| Survey responses, outbox, rate-limit keys | various | delete |
| Contest-day staff accounts | `vsyc_staff_accounts` | deactivate (keep the club's permanent staff) |
| Comp codes, event flags | | clear |
| Audit log | `vsyc_audit_log` | keep a summary of the purge, delete the rest older than the retention window **(you)** |

## Decisions needed **(you)**

1. **Payment records.** Stripe keeps its own. Do we keep a minimal ledger (amount, date, refund
   status, no name or email) for the club's books, and for how long?
2. **Waivers and guardian consent for minors.** How long must the signed terms or consent record
   be kept? If a year or more, keep only the consent record, not the rest of the profile.
3. **Anonymize or delete registrants.** Keep an anonymized row (division, state, age band) for
   year-over-year stats, or delete outright?
4. **Returning players.** Do players keep an account across seasons (so a purge must spare them),
   or does everyone re-register each year?
5. **State champion history.** Keep a small table of past champions so eligibility rules (#82) can
   look back?

## Process (what gets built)

1. `npm run archive -- --season 2026`
   - Reads only through the same code paths the public results page uses (so privacy rules can't
     drift), writes `archive/2026/`, prints a report: counts per division/round/match.
2. `npm run archive:verify`
   - Counts in the files match the database; no email, phone, address, birth date or Stripe id
     appears anywhere in the output; every minor not opted in is in restricted form.
3. A person reviews the generated pages and merges the PR in the club site repo.
4. `npm run purge -- --season 2026` (dry run by default, `--apply` to run)
   - Refuses unless: the freeze PR is merged (checked by the live URL returning the archive), a
     `db-backup.yml` dump from the last 24 hours exists and its restore was tested this season,
     and the operator types the season to confirm.
   - Deletes in an order that never leaves dangling rows, in batches, resumable, and writes one
     audit row of counts (not names).
5. Reset for next season: `contest.config.ts` (season, dates, divisions, `roundPlan`), re-sync
   `vsyc_divisions`, new music bucket name derived from the season (today `vsyc26-music` is a
   constant), clear event flags and comp codes.

## Safety rules

- Purge never runs from a web request or a cron job; it's a command a person runs, after a backup.
- Everything has a dry run that prints exactly what would go.
- The archive is generated from the database, not from the live site, so a purge can't remove
  something the archive needed.
- The same tooling ships in `yoyo-registration-template` so any club can run its own rollover.
