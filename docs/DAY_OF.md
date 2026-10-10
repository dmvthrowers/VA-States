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
