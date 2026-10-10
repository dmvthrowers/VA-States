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

## Code of conduct version

Every registration, spectator and volunteer stores the version of the code of conduct they accepted
(`code_of_conduct_version`, set from `contest.codeOfConductVersion`; the registrations CSV export includes it).
Anyone who signed up before this was recorded has none. After you revise the code, bump the version and
`lib/conduct-version.ts` says who is still on an old one. Recording only: nothing asks people to accept again.
Needs migration `0054_conduct_version.sql` (applied 2026-10-10).

## Open books

The public budget page (`/budget`) adds a **By Category** section: income and costs by category, with a **Planned**
column next to **Actual**. In the admin Budget tab, tick **Planned figure** to publish a number before the event;
planned rows never count toward the totals or the fundraising goal. Categories: registration (planned only, since
actual registration income is read live from paid fees), sponsor, merch, spectator income, venue, prizes, equipment,
printing, food, insurance and other. `contest.budgetLeftoverNote` says where any surplus goes ("" hides it).
Existing entries keep their category and count as actual. Needs migration `0057_open_books.sql` (applied 2026-10-10).
