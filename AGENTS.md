# AGENTS.md — VA-States (VSYC-26 Registration)

Orientation for any AI agent landing in this repo cold.

## What this is

**A real, live production app** — the registration and day-of operations system for the
Virginia State Yo-Yo Contest 2026 (VSYC-26), a DMV Throwers yo-yo club event. Deployed at
`https://register.dmvthrowers.club` (Vercel). Not a prototype: it handles real registrations,
real Stripe payments, and real event-day operations (judge scoring, DJ music queue, run order,
staff/admin dashboards). Package name internally is `vsyc26-registration`.

Repo name is misleading relative to content — this isn't a general "Virginia states" project,
it's specifically the VSYC-26 registration/ops app. `README.md` at the repo root is accurate
and detailed; read it first, this file adds orientation notes README doesn't cover.

## Stack

Next.js 16 App Router + TypeScript, Supabase (Postgres + auth, **a separate isolated project
from `yoyo-player-map`'s Supabase** — see `.env.local.example`'s comment), Stripe Checkout +
webhooks for payment, Resend for email, Upstash/Vercel KV for rate limiting, Tailwind CSS,
Vercel deployment on `main`.

## Real current state

As of October 2026 the contest is over and the app is in wrap-up. `docs/REPO_GUIDE.md` is the
current architecture map and `docs/ROADMAP.md` the prioritized open work; the full October 2026
audit lives in the club's Google Drive
([Technical docs - Oct 2026](https://drive.google.com/drive/folders/1Jt7amThKNkeVJenksPtA87cBtR-nwZiq),
access-restricted). The history below is kept for context.

### History (per `docs/REGISTRATION_AUDIT.md`)

As of the last audit doc in this repo, ~80% of the target feature set was built and the one
major gap (integrated online payment) has since been closed — `docs/STRIPE_PAYMENTS.md`
documents Stripe Checkout + webhook reconciliation being added, with the old manual
PayPal/Venmo flow kept as a fallback. Git history (`git log --oneline`) shows continued active
feature work since then: budget management, discount codes, volunteer management, nav/mobile
fixes, comp-code desync fix. Treat this as actively developed, not finished-and-frozen.

## Layout

```
app/              pages + API routes -- admin, admin-dashboard, budget, competitors, confirm,
                  directory, dj, fee-calculator, judge, player, policies, portal, results,
                  spectate, spectators, staff, upload, volunteer
components/       BudgetManager, DirectoryClient, Footer, NavBar, RunOrderBoard,
                  RunOrderManager, SurveyContacts, SurveyForm, SurveyResults, VolunteerManager
lib/              pricing.ts, stripe.ts, email.ts, rate-limit.ts, event-flags.ts,
                  comp-code-guard.ts, audit.ts, tokens.ts, validation.ts, ics.ts,
                  auth/staff.ts, auth/admin-request.ts, supabase/client.ts, supabase/admin.ts
supabase/migrations/   41 real schema/RLS migrations -- read the README and the newest few
                  before touching schema, this is a live database with real registrant data
docs/             REPO_GUIDE.md (start here), ROADMAP.md (open work), specs/,
                  REGISTRATION_AUDIT.md, STRIPE_PAYMENTS.md -- read STRIPE_PAYMENTS.md
                  before touching payment or registration-status code
```

## Standing rules / things that will bite you if assumed wrong

- **This is a live app with real user data and real payments flowing through it.** Treat
  `supabase/migrations/` changes and anything touching `lib/stripe.ts` or the webhook route
  with production-change care, not prototype care.
- **Auth fails closed by design.** Staff and admins sign in with Supabase Auth; every
  `/api/admin` and `/api/ops` route is guarded by `requireAdminRequest()` (lib/auth/admin-request.ts, also limited to 60
  calls per IP per minute), which needs a valid bearer token *and* an
  active `admin` row in `vsyc_staff_accounts` (judge/DJ/audio-tech roles get the day-of
  portals). Don't "fix" a local 401 by loosening that check — add yourself a staff row instead.
  There is no shared admin password or PIN: `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `DJ_PIN` and
  `JUDGE_PIN` are not read by any code.
- **Never commit live secrets** — `.env.local.example` is the template; real values live in
  `.env.local` (gitignored) and Vercel env vars. The README says to treat any credential that
  ever hit git history as compromised and rotate it.
- **Stripe webhook is idempotent on purpose** (`checkout.session.completed` sets `paid`,
  `payment_method`, `paid_at`, `payment_intent_id`, `amount_paid_cents` — safe on replay). Don't
  add logic that assumes the webhook fires exactly once.
- **Pricing/deadline config is env-driven, not code-driven** — `EARLY_BIRD_CUTOFF_ISO`,
  `ONLINE_REG_CUTOFF_ISO`, `MUSIC_DEADLINE_ISO` change without a redeploy. Check env vars
  before assuming a pricing bug is in `lib/pricing.ts`.
- **Free-tier stability constraints are deliberate**, not accidental corner-cutting: in-memory
  singleton Supabase/Resend clients, 5-minute ISR on public list pages, 30s event-flag cache
  (tunable via `EVENT_FLAGS_CACHE_TTL_MS`), rate limiting fails open on KV outages (registration
  must not hard-fail on a provider incident), bounded email-send waits. Don't "simplify" these
  away without understanding they're load-bearing for staying on free tiers during a real event.
- **Separate Supabase project from `yoyo-player-map`** — don't assume shared auth/data between
  the two repos even though they're both DMV Throwers apps.

## Verify / run locally

```bash
npm install
cp .env.local.example .env.local   # fill Supabase/Stripe/email/auth secrets
npm run dev                        # local dev server
npm run build                      # production build validation
npm run lint                       # ESLint
npm run typecheck                  # tsc --noEmit (CI gate)
npm test                           # pure-logic tests for the money paths
```

Post-deploy checklist is in `README.md`'s "Deployment" section — public registration/RSVP
submit, Stripe webhook receiving signed events, admin auth, policies page.

## Relationship to the template

`yoyo-registration-template` is derived from this repo. **Fixes land here first**, then get ported
to the template (shared pieces: `components/form/Field.tsx`, the SEO routes, the accessibility fixes).
The two have drifted in other places (migrations, `db-backup.yml`, `DAY_OF.md`), so port by hand.
