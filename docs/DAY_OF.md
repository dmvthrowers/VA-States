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
