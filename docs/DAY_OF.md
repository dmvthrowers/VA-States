# Running the Day

Live schedule, per-division results, side events and stream overlays. They're ported from
[yoyo-registration-template](https://github.com/dmvthrowers/yoyo-registration-template), which
documents them in full in `docs/FORMATS.md` → Live schedule and Side events. The tables come from
migration `20261005170000_0037d_0041_formats_expand.sql`.

## Set up

Edit `contest.config.ts → dayOf`:

- `schedule`: each block's id, title, planned `start` ("HH:MM", America/New_York), `minutes`
  and, for a judged block, its `division`. `fixed: true` blocks (awards, wrap-up) never move.
- `sideEvents`: quick crowd challenges. `kind: 'timer'` (longest sleeper) or `kind: 'counter'`
  (most loops, with an optional `timeLimitSeconds`).

`npm test` checks both lists (`lib/contest-config.test.mjs`).

## On the day

| Page | Who | What |
|---|---|---|
| `/admin/schedule` | admin, DJ, audio tech, judge | Start a block, Close judging, Publish results. Later blocks move with the real times |
| `/schedule` | public | The day with live times, who's on stage and on deck (from the run order) |
| `/staff/side-events` | any staff role | Stopwatch or tap counter; save a try under first name + last initial |
| `/side-events` | public | Side-event leaderboards |
| `/overlay/schedule`, `/overlay/side-event?code=SLEEPER` | OBS | Transparent browser sources; add `?bg=1` to preview |

**Publish results** on a judged block releases that division right away (`vsyc_results_releases`).
The dashboard's `results_published` flag still publishes everything at once. `/results` and
`GET /api/scores` honor both (`lib/results-visibility.ts`).

## Published draws (off by default)

Every saved run order can say how it was made, and the public run-order page shows it:

- **Random draw**: the **Random draw** button picks a seed and orders everyone by it. The seed is published; the
  page re-runs the draw in the visitor's browser and says whether the order matches. The algorithm is in
  `lib/draw.ts` (sort the registration ids, then Fisher–Yates driven by sfc32 seeded from the seed text), so anyone
  can re-run it. The server refuses a "random" order that isn't what its seed draws.
- **Rule**: **Auto-sort by pref** and the next-round advance record the rule in words.
- **Hand edit**: needs a reason, shown publicly.

Set `dayOf.publishedDraws: true` and a save that doesn't say how the order was made is refused.
With it off, orders save as before and a draw is recorded only when one is sent. Needs migration
`0053_run_order_draws.sql` (applied 2026-10-10).
## Release gates (off by default)

Set `dayOf.releaseGates: true` in `contest.config.ts` and a round's results can be published from **Run the Day**
only when two things are true:

1. The scores-in board is full: the round has a run order, every competitor has finished performing and has a
   score from every judge who scored anyone (the same check as `/api/admin/score-status`).
2. The head judge has tapped **Mark scores checked** (admins and judges).

If a score is added or edited after the check, the gate closes again until it is re-checked. Resetting a block
takes back its check. Publishing without a check answers 409 with the reasons, and **Run the Day** shows them.
The dashboard's `results_published` switch skips the gates on purpose: it is the "show everything" override.
Needs migration `0052_release_checks.sql` (applied 2026-10-10).

## MC cards

`/mc/cards` (admins; linked from `/staff`) shows one card per competitor in run order for the announcer: the name as
the public pages show it (the same privacy rules), how to say it, the intro line and the sponsor, as people gave them at
sign-up. The three sign-up fields are optional (`name_pronunciation`, `intro_note`, `sponsor_name`). Cards reload every
15 seconds and print as a fallback. Needs migration `0056_mc_card_fields.sql` (applied 2026-10-10).
## Code of conduct version

Every registration, spectator and volunteer stores the version of the code of conduct they accepted
(`code_of_conduct_version`, set from `contest.codeOfConductVersion`; the registrations CSV export includes it).
Anyone who signed up before this was recorded has none. After you revise the code, bump the version and
`lib/conduct-version.ts` says who is still on an old one. Recording only: nothing asks people to accept again.
Needs migration `0054_conduct_version.sql` (applied 2026-10-10).

## Bracket match scores (off unless configured)

For battles won on points (best-of-N), add `matchScoring` to a bracket division in `contest.config.ts`:

```ts
scoring: { format: 'bracket', seeding: 'random', thirdPlaceMatch: true, matchScoring: { to: 3, finalsTo: 5 } }
```

First to `to` wins a match; the final plays to `finalsTo` (default: same as `to`); the third-place match plays to `to`.
On the admin and judge bracket screens the selected match shows a **+ / −** counter for each side; **Save score** stores
it (`/api/admin/bracket/score`). When a side reaches the target it is set as the winner exactly as **Confirm** would
(advancing, filling the third-place match), and a score that is no longer decisive takes a standing winner back. Play stops
at the target, so a score above it, or both sides on it, is refused. Running scores show on the public bracket. Taking a
result back removes the scores of any later match whose entrants change. Needs migration
`0058_bracket_match_scores.sql` (applied 2026-10-10). No VA-States division sets `matchScoring`, so brackets work as before.
## Open books

The public budget page (`/budget`) adds a **By Category** section: income and costs by category, with a **Planned**
column next to **Actual**. In the admin Budget tab, tick **Planned figure** to publish a number before the event;
planned rows never count toward the totals or the fundraising goal. Categories: registration (planned only, since
actual registration income is read live from paid fees), sponsor, merch, spectator income, venue, prizes, equipment,
printing, food, insurance and other. `contest.budgetLeftoverNote` says where any surplus goes ("" hides it).
Existing entries keep their category and count as actual. Needs migration `0057_open_books.sql` (applied 2026-10-10).

## Add-on divisions (none configured)

A `$0` division that re-ranks another division's results: Girls, Student, Masters. In `competition.divisions`:

```ts
{ code: 'GIRLS', name: 'Girls Freestyle', description: 'A free add-on for girls and women who enter 1A.',
  priceCents: 0, music: false, scoring: { format: 'addon', parent: '1A', minAge: 8, maxAge: 17 /* both optional */ } }
```

Players tick it at registration, and it needs the parent ticked too (and, if set, an age inside the limits, checked on
the form and on the server). The tick is the player's own: the description says who it is for, and the app collects
nothing about gender or student status. The add-on has no run order, music or judging. Its results are the parent's
standings kept to the people who ticked it, in the parent's order, renumbered from 1 with ties kept, and they appear
when the parent's results are released. The parent must be a solo, ranked division (not a showcase, not another add-on).
Run `npm run divisions` and apply `supabase/divisions.sql` after adding one. Needs migration `0059_addon_divisions.sql`
(applied 2026-10-10). **No VA-States division is an add-on yet**; who qualifies for Girls is still an owner decision.


## Rules page (off here until the rules text is set)

`/rules` shows the current rules version, each division's scoring in a line, and a dated list of every change, newest
first (`contest.rulesPage` in `contest.config.ts`). When you change a rule, add an entry at the top of `changes` and
set `version` to match; a test fails if they disagree or a date is malformed. Publish it before registration opens.
`enabled: false` drops the page and its footer link. Your own full rules page (`contest.links.rules`) is linked from it.

## Contest guide (off here until the copy is checked)

`/guide` is one public page built from `contest.config.ts`: date and venue, every division with its fee, how it is
judged and its routine length, the registration and music-upload deadlines (in the venue's time zone and, when it
differs, the reader's own), and a "Never competed before?" path: divisions marked `beginnerFriendly: true`, the
`contest.guide.bring` list and the day's planned schedule. Nothing to write by hand; change the config and the page
follows. `contest.guide.enabled: false` drops the page and its footer link.

## Trick lists page

`/tricks` lists the tricks of every `ladder` division in order, with how the ladder works (tries per trick, or points).
It is built from `competition.divisions`, so it appears, with a footer link and a sitemap entry, only when a ladder
division exists. Nothing to write by hand.
