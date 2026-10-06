# VA-States — Repository Guide

For a volunteer developer seeing this codebase for the first time. Read `AGENTS.md` for the
standing rules and `docs/STRIPE_PAYMENTS.md` before touching anything that moves money.

Last checked against `main` on 2026-10-02. Adapted from the October 2026 technical audit, with
its claims re-checked against the code; where the audit and the code disagreed, this file
follows the code.

## 1. Purpose

VA-States (package name `vsyc26-registration`) is the registration and day-of operations app
for the Virginia State Yo-Yo Contest (VSYC-26, held Sept 19, 2026 at Dulles Town Center). It
covers the competitor lifecycle — registration with pricing and comp codes, Stripe card
payments, music upload, spectator and volunteer RSVP, run order, judge scoring, DJ audio access,
results, and post-event surveys — plus staff tooling: admin dashboard, budget, survey invites,
and an audit log of every money and admin action.

Three audiences:

- **Players** register, pay, upload music, view confirmation and results.
- **Staff** score (judges), play music (DJ / audio tech), and edit run order.
- **Admins** manage the roster, payments, budget, run order, codes and surveys.

Production: `https://register.dmvthrowers.club` (Vercel, region `iad1`). Only `main` deploys;
preview deployments are disabled in `vercel.json`.

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15.5 App Router | `package.json` pins `^15.5.27`. Node 22 (`engines`) |
| Language | TypeScript 5.9 | `npm run typecheck` = `tsc --noEmit`, gated in CI |
| Database / auth | Supabase (Postgres + RLS + Auth + Storage) | Its own project, separate from the YoYo Map's |
| Payments | Stripe 17 (hosted Checkout + webhooks) | See `docs/STRIPE_PAYMENTS.md` |
| Email | Resend 4 via an outbox table | `email_outbox`: daily budget, dedupe keys, drained by cron |
| Rate limiting | `@upstash/ratelimit` on `@vercel/kv` | Sliding window per IP; **fails open** if KV is down (deliberate) |
| Errors | Sentry (`@sentry/nextjs`) | Off when `NEXT_PUBLIC_SENTRY_DSN` is unset |
| Job monitoring | Healthchecks.io check-ins (`lib/heartbeat.ts`) | Off when `HEALTHCHECKS_PING_KEY` is unset |
| Queue backstop | Upstash QStash (`lib/qstash.ts`) | Signed schedule can call the email drain |
| UI | Tailwind 3.4, Radix primitives, lucide-react, react-hook-form, zod 3 | |
| Analytics | `@vercel/analytics` | Page views only |

## 3. Layout

| Path | What's there |
|---|---|
| `app/` | App Router pages and API route handlers |
| `app/api/` | ~47 route handlers (grouped in the table below) |
| `lib/` | Shared server logic: errors, auth, Stripe, payments, email, rate limits, pricing, validation |
| `components/` | `BudgetManager`, `DirectoryClient`, `Footer`, `NavBar`, `RunOrderBoard`, `RunOrderManager`, `SurveyContacts`, `SurveyForm`, `SurveyResults`, `VolunteerManager` |
| `middleware.ts` | Redirects legacy `/admin*` pages to `/admin-dashboard`, blocks bot user agents on API GETs, sets `X-Robots-Tag: noindex` on APIs |
| `supabase/migrations/` | 41 migration files. Read `supabase/migrations/README.md` before adding one |
| `docs/` | `STRIPE_PAYMENTS.md`, `REGISTRATION_AUDIT.md`, `ROADMAP.md`, `specs/` |
| `.github/workflows/` | `ci.yml` (typecheck → lint → test → build), `db-backup.yml` (nightly encrypted dump) |
| `.github/dependabot.yml` | Weekly npm (grouped prod/dev patch+minor) and GitHub Actions updates |
| `.env.local.example` | Every env var name with setup notes. Never commit real values |
| `vercel.json` | Region, main-only deploys, daily crons at 00:05 and 00:20 UTC |

### Pages

- Public: `/` (registration), `/competitors`, `/directory`, `/results`, `/results/run-order`
  (gated by the `results_published` event flag), `/budget`, `/fee-calculator`, `/policies`,
  `/spectate`, `/spectators`, `/volunteer`.
- Personal or day-of (noindex): `/confirm`, `/upload`, `/player`, `/portal`, `/spectators/portal`,
  `/staff`, `/judge`, `/dj`, `/admin-dashboard`.
- `/admin/*` is the older admin UI; `middleware.ts` sends it to `/admin-dashboard`.
- `/feedback` redirects to `/survey/spectator` (short link for QR codes). `/survey/[type]` is
  unlisted and noindex.

Each page's `<title>` comes from a small `layout.tsx` next to it (the pages are client
components, so they can't export metadata themselves). The root layout sets the template
`%s · VSYC-26`.

### API route groups

| Group | Job |
|---|---|
| `register` | Competitor registration: rate limit (3/IP/hr) → zod validation → honeypot → event-flag and cutoff checks → atomic comp-code redeem (`redeem_comp_code` RPC) → fee calc (`lib/pricing.ts`) → insert → confirmation email |
| `checkout`, `checkout/status` | Create or reuse a Stripe Checkout Session (rate-limited 10/IP/15 min; idempotency key; refuses already-paid). `/status` lets the confirm page poll and records a paid session directly if the webhook is late (60/IP/5 min) |
| `webhooks/stripe` | Verifies the signature, stores the event in `vsyc_stripe_events`, then dispatches: completed / async-succeeded → `applyPaidSession()`; `charge.refunded` → `refundTransition()` |
| `player-auth/signup`, `player/*` | Supabase Auth account linked to a registration (signup rate-limited 5/IP/hr); player self-service |
| `spectator-*`, `volunteer-*`, `survey` | RSVPs, volunteer signup, survey submissions — rate-limited |
| `upload` | Two-step music upload: `sign` returns a signed Storage URL, `confirm` checks the object landed. The file goes browser → Storage, never through a function |
| `run-order`, `scores` | Public run order (minors anonymized via `lib/display-name.ts`); judge scoring |
| `ops/*` | Staff ops dashboard, event flags, comp codes, contestant/spectator detail |
| `dj/music-url`, `staff/me` | Signed music URLs for playback; staff identity |
| `admin/*` | ~20 routes, all behind `requireAdminRequest` (Supabase staff bearer with `role='admin'`) |
| `cron/*` | `drain-email` and `reconcile-payments`, behind `requireCronOrAdmin` (`CRON_SECRET`, timing-safe, fails closed). `drain-email` also accepts a signed QStash request |
| `health` | Light probe; `?deep=1` runs a DB query only with the `HEALTHCHECK_TOKEN` header |
| `validate-code` | Comp-code check: per-IP rate limit plus per-code lockout (`lib/comp-code-guard.ts`) |

### Key `lib/` files

| File | Responsibility |
|---|---|
| `api-error.ts` | `apiError(code, msg, requestId)` and `withErrorHandling`, which adds `x-request-id` and turns throws into `internal_error` |
| `rate-limit.ts` | `checkRateLimit(ip, action, max, windowMinutes)`, `getClientIp(headers)` |
| `audit.ts` | `logAudit(action, {...})` → `vsyc_audit_log`. Never throws |
| `supabase/admin.ts` | Service-role client (bypasses RLS). API routes only, never client components |
| `auth/staff.ts`, `auth/admin-request.ts` | Bearer token → `supabase.auth.getUser()` → `vsyc_staff_accounts` row with role `admin`, `judge`, `dj` or `audio_tech`. `requireRunOrderEditorRequest` also lets judge/DJ/audio tech edit run order on contest day |
| `auth/cron.ts` | `requireCronOrAdmin` |
| `payments.ts`, `payment-decision.ts` | `applyPaidSession()` — the single path that records a payment (webhook, confirm-page poll, checkout reuse, reconcile sweep). Guarded `eq('paid', false)` update; duplicates go to `vsyc_payment_flags` plus an admin email, never auto-refunded; a session whose payment was fully refunded is ignored, not re-marked paid |
| `stripe-refund.ts` | `refundTransition()`: full refund → `paid=false`; partial → audit log only |
| `outbox.ts`, `email.ts`, `email-policy.ts` | Email outbox with daily cap (`EMAIL_DAILY_LIMIT`) and a reserve for confirmations |
| `event-flags.ts` | Runtime flags from `vsyc_event_flags` (`online_registration_open`, `results_published`), cached 30s |
| `pricing.ts`, `validation.ts`, `tokens.ts`, `filename.ts` | Fee engine, zod schemas, signed upload tokens, canonical music filenames |

### Tests

`npm test` runs `node --experimental-strip-types --test 'lib/**/*.test.mjs'` — 26 tests over
the pure money logic (`payment-decision`, `stripe-refund`, `email-policy`). No route-level
integration tests yet (see `docs/ROADMAP.md`).

## 4. How it works

### Registration → payment

```mermaid
flowchart TD
  A[POST /api/register] --> B{rate limit 3/IP/hr}
  B --> C[zod + honeypot + flags/cutoffs]
  C --> D[redeem_comp_code RPC]
  D --> E[calculateFee]
  E --> F[insert vsyc_registrations]
  F --> G{fee due?}
  G -->|no| H[/confirm]
  G -->|yes| I[POST /api/checkout]
  I --> J{open session?}
  J -->|yes| K[reuse URL]
  J -->|no| L[create session, idempotency key]
  L --> M[Stripe hosted checkout]
  M --> N[POST /api/webhooks/stripe]
  N --> O[verify signature, store in vsyc_stripe_events]
  O --> P[applyPaidSession]
  T[GET /api/checkout/status] -.-> P
  U[cron reconcile-payments] -.-> P
```

`applyPaidSession()` is the one choke point and it is idempotent. The amount charged is always
`fee_cents` from the database row — no client-supplied price anywhere.

### Staff and admin auth

Staff sign in with Supabase Auth. Every admin route starts with `requireAdminRequest()`, which
validates the bearer token with Supabase and looks up an active `admin` row in
`vsyc_staff_accounts`. There is **no** shared admin password or PIN: `ADMIN_USERNAME`,
`ADMIN_PASSWORD`, `DJ_PIN` and `JUDGE_PIN` are not read by any code (the last reader, the unused
`/api/dj/auth` route, was removed in October 2026).

### Music upload

Music is stored per **slot**: one track per player, per division, per slot (`vsyc_music`, unique on
registration + division + slot). `contest.config.ts` says which slots a division has
(`musicSlotsOf`):

| `music:` in the division | Slots |
| --- | --- |
| `true` | `main`: one routine track for the division (VSYC-26 today) |
| `{ perRound: true }` | one per round, e.g. `prelims`, `semi-final`, `final` (needs `rounds`; a round may set its own `key`) |
| `{ extra: [{ key: 'battle', label: 'Battle music' }] }` | the routine track plus battle music |
| `{ routine: false, extra: [...] }` | extras only, e.g. a battle division |
| `false` | none |

So a 1A + X player in a contest with prelims and finals uploads four tracks (1A prelims, 1A
final, X prelims, X final), plus a battle track if a battle division asks for one. Nothing in the
code is yo-yo specific: a kendama or juggling contest sets its own divisions, rounds and extras.

`GET /api/upload?token=…` lists a player's slots. `/upload?token=…` (token minted at registration)
→ `POST /api/upload {action:'sign', division, slot}` checks payment, deadline
(`MUSIC_DEADLINE_ISO`), that (division, slot) is one of the player's, mime (mp3/wav/m4a) and size
(128 MB) and returns a signed upload URL for bucket `vsyc26-music` (file `DIVISION_Last_First.ext`;
`DIVISION_SLOT_Last_First.ext` for rounds and extras) → browser PUTs the file →
`{action:'confirm', division, slot}` re-derives the filename server-side, checks the object
exists, records the track, emails a receipt and writes `music_received` / `music_replaced` to the
audit log. `slot` may be left out when a division has one track. A slot that already holds the
player's own track is refused (409) unless the request says `replace: true`, and the page asks
first. Staff upload through `/api/admin/music-upload` (POST then PATCH) on the run order screens,
for the track the round shown plays. The DJ queue plays the slot for the round on screen
(`playSlotFor`; the run-order API returns it as `music_slot`), and the player page, CSV export
(`music_1A`, or `music_1A_prelims`... when a division has several) and admin Music tab all resolve
tracks per slot (`lib/music.ts` has the pure helpers). The old single slot
(`vsyc_registrations.music_path` / `music_filename`) is no longer read; a later migration drops it.
`vsyc_registrations.music_uploaded_at` is kept current by a trigger ("has a real track").
Switching a division from `music: true` to per-round later leaves its existing `main` tracks in
place but unused: have players upload the round tracks, or re-file the old ones by hand.

Empty slots: the admin dashboard's **Music** tab shows slots per division, sends per-division
reminder emails (`/api/admin/music-reminders`, dry-run by default, once a day per person and set
of divisions, before the deadline) and assigns a random lo-fi track to every still-empty slot (a slot is a division and track)
(`/api/admin/music-fallback`, dry-run by default, after the deadline unless forced, never
overwrites a track). The lo-fi pool is the `lofi/` folder of the `vsyc26-music` bucket: put only
tracks you have the right to play there. A fallback is a `vsyc_music` row with `source =
'fallback'`; staff see "LO-FI (no upload)", and a player's own upload replaces it.

### Battles on the DJ page

A bracket division (`scoring.format: 'bracket'`) gets a battle view on `/dj` instead of a run order.
`GET /api/dj/battle?division=…` (DJ, audio tech, admin) returns the bracket in play order (third
place just before the final), both entrants' names and whether each has the battle track
(`playSlotFor`: the first extra when the division has `music: { routine: false, extra: [...] }`),
and `cue_id`: the live match, else the next undecided one (`lib/battle-cue.ts`). The page shows
the two entrants side by side with Play and Download for each (through `/api/dj/music-url`), the
division's battle rules, and an "Up next" list where staff can cue any other match. Setting a match
live and confirming winners stays on the admin bracket screen.

### Rounds by entrant count (site issue #80)

A division lists every round it could have (`rounds`) and a `roundPlan` of tiers: the first tier
whose `upTo` is at least the number of entrants wins, and its `rounds` (by round key) are the ones
that run, with how many advance from each. Skipped rounds keep their numbers, so music tracks,
scores and run orders never need renumbering. Pure rules and tests: `lib/round-plan.ts`.

```ts
// 1A and X, as decided in #80. Sport has no extra rounds (one 1-minute routine).
rounds: [{ name: 'Prelims', seconds: 60 }, { name: 'Semi-final', seconds: 90 }, { name: 'Final', seconds: 180 }],
roundPlan: [
  { upTo: 25, rounds: [{ key: 'final' }] },
  { upTo: 50, rounds: [{ key: 'prelims', advance: 15 }, { key: 'final' }] },
  { rounds: [{ key: 'prelims', advance: 20 }, { key: 'semi-final', advance: 10 }, { key: 'final' }] },
],
music: { perRound: true },   // optional: a track per round
```

Flow on contest day: when registration closes, the **Round plans** panel (admin, on the run order
screen) shows how many entered and the suggested plan; an organizer confirms it
(`POST /api/admin/rounds/plan`, migration 0045 `vsyc_round_plans`, audit `round_plan_confirmed`) or
picks another tier. Until a division is confirmed every round counts, and the advance button is
refused. After that:

- Round tabs on `/judge`, `/dj`, the run order screens and the public run order show only rounds
  that run (`GET /api/rounds/plan` is the public read), and `/api/scores` refuses a skipped round.
- **Advance** (`POST /api/admin/rounds/advance`) takes the confirmed count and writes the next
  running round's run order, best seed last, which is also the DJ queue. A tie across the cut asks
  first: advance everyone tied or pick exactly the open spots (`dry_run` previews; audit
  `round_advanced` records the choice). A stale plan (entrants changed tier since) is flagged.
- Results show each played round, with how many advanced, and "Out in Prelims" style detail on the
  overall order. Players see the plan on the registration card.

The shipped VSYC-26 config has no `roundPlan`, so nothing above changes for it.

### Score status and the ready-to-publish check (site issue #83, first slice)

`GET /api/admin/score-status?division=1A&round=1` (admin or judge; `lib/score-status.ts`, tested) reports
one round's judging live: per competitor, who has scored and who hasn't, the median and spread, and
scores far from the judges' median (more than 15% of the sheet's top score, with at least three judges;
measured against the median of all scores so one wild score can't hide itself). A judge counts as expected
for the round once they've scored anyone in it. **Blockers** (not ready): no run order, no scores, a
competitor who hasn't finished performing or has no scores, or a score missing from one judge.
**Warnings**: outliers, only one judge, scored people not in the run order.

On `/admin/schedule` a judged block shows **Check scores** (a table plus the issues), and **Publish results**
first loads the same check and puts the problems in its confirmation. Publishing is never blocked: an
organizer can always choose to publish anyway. The other #83 candidates (head-judge lock/unlock, structured
deduction notes, offline-tolerant tablet submission, category breakdowns) wait on the judges' debrief the
issue asks for first.

### Home-state champion (site issue #82)

Each division gets its own state champion (`contest.stateChampion`: `{ state: 'VA', title: 'VA State
Champion' }`), the best-placed **eligible** finisher, even when off the podium, with a prize of its own.
Eligibility is decided by **home address** (`lib/residency.ts`, tested):

- Registration's state field is a list of the 50 states plus **DC as its own option**. Anyone choosing the
  champion's state also gives a home street address and ZIP and ticks "I live at this address in Virginia".
  Address and ZIP are stored on `vsyc_registrations` (`home_address`, `home_zip`; migration 0047), shown
  only to admins, and kept only for that state. No public view selects them.
- `home_state_confirmed` is the registrant's confirmation; `home_state_override` is an organizer's decision
  (`true` eligible, `false` not, `null` automatic), set per contestant in the admin dashboard, which also
  shows an "ELIGIBLE" tag and a champion-eligible filter. Overrides are audited (`home_state_override_set`).
- Walk-ups from the champion's state count as confirmed (staff ask in person).
- `stateChampions(rows, state, eligible)` and `fetchHomeStateEligible()` in `lib/standings.ts` pick the
  champion per division (ties share the title); `/results` shows it next to the placement. If the new
  columns can't be read, results fall back to the old rule (entered the champion's state), so 2026 results
  never lose their champions. Migration 0047 backfills `home_state_confirmed = true` for everyone who
  already entered VA, so 2026 results are unchanged.
- `winnersFrom(standings, { state, eligible })` adds each champion to the prize/survey list (marked
  `champion`, not duplicated if they're on the podium). Prizes per division: 3 podium places + 1 champion;
  three divisions = 12.

Judges don't see the eligibility flag: it could bias scoring, and the title is decided after the results.

### Prizes that scale with the contest

How many prizes a division gives is configuration, not code (`lib/prizes.ts`, tested). `contest.prizes.places` in
`contest.config.ts` is the default podium size (3). A division can override it with its own `prizes`:

```ts
prizes: { tiers: [{ upTo: 4, places: 1 }, { upTo: 9, places: 2 }, { places: 3 }], champion: false }
// 1 prize under 5 entrants, 2 under 10, 3 above; `champion: false` skips the home-state champion prize
```

The first tier whose `upTo` is at least the number of entrants wins; `places: 0` gives no podium prizes. The
home-state champion prize (`contest.stateChampion`) is one more per division unless the division opts out. The
admin dashboard's **Prizes** panel (`GET /api/admin/prizes`) shows the plan for the people entered so far, per
division and in total (3 divisions × (3 + 1) = 12 today), and moves as registration does; it is a maximum, since a
division with no eligible home-state finisher awards no champion prize. When results are in, `winnersFrom` and the
winner survey invites use the same rules, sized by how many competitors placed in each division. Add a division
(for example the Sport brackets in #81) and the total follows.

## 5. Config and environments

All config is env vars; `.env.local.example` lists every name with notes. Production values live
in Vercel → Settings → Environment Variables.

- **Local:** `cp .env.local.example .env.local`, fill Supabase and Stripe **test** keys,
  `npm run dev`. Forward webhooks with
  `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
- **Production:** live Stripe keys; the live webhook endpoint must subscribe to
  `checkout.session.completed`, `checkout.session.async_payment_succeeded` and
  `charge.refunded`.
- **Migrations:** files are named by the version production recorded. Use the Supabase CLI or
  `apply_migration`, never hand-run SQL that isn't committed. Details in
  `supabase/migrations/README.md`.
- **Backups:** `db-backup.yml` runs nightly once `SUPABASE_DB_URL` and `BACKUP_AGE_RECIPIENT` are
  set; the dump is age-encrypted and kept 30 days as a workflow artifact.

## 6. Where to go next

- `docs/ROADMAP.md` — open work, in priority order, with what's already done.
- `docs/specs/idea-board.md` — the planned public `/ideas` board for VSYC-27.
- `docs/STRIPE_PAYMENTS.md` — the payment flow end to end.
- [Technical docs - Oct 2026](https://drive.google.com/drive/folders/1Jt7amThKNkeVJenksPtA87cBtR-nwZiq)
  (Google Drive, access-restricted) — the full audit this guide came from, including the
  security assessment and runbooks that are kept out of the public repo.
