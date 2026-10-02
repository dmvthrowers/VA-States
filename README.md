# VA-States (VSYC-26 Registration)

Production registration and operations app for the Virginia State Yo-Yo Contest 2026
(held September 19, 2026 at Dulles Town Center). Now in post-event wrap-up and VSYC-27 planning.

Primary domain: <https://register.dmvthrowers.club>

**New here?** Read [`docs/REPO_GUIDE.md`](docs/REPO_GUIDE.md) (how the app works) and
[`AGENTS.md`](AGENTS.md) (standing rules), then [`docs/ROADMAP.md`](docs/ROADMAP.md) (open work).

## Stack

- Next.js 15 App Router (TypeScript), Node 22
- Supabase (Auth + Postgres + Storage) — its own project, separate from the YoYo Map's
- Stripe Checkout + webhooks
- Resend email through an outbox table
- Upstash rate limiting; optional Sentry, Healthchecks.io and QStash
- Vercel deployment (`main` only, region `iad1`)
- Tailwind CSS

## Core Features

- Competitor registration flow with pricing engine and discount codes
- Spectator RSVP flow with optional public profile
- Staff/admin auth (Supabase Auth + `vsyc_staff_accounts` roles) and event operations dashboard
- Run-order management and results publishing controls
- Stripe payment capture with webhook reconciliation
- Policy page and event metadata for discoverability
- Post-event feedback surveys (spectator one is public at `/feedback` for walk-ups; the rest are unlisted) (`/survey/competitor|winner|spectator|volunteer|vendor|sponsor`) with an admin Surveys tab for results, CSV export, and email invites — questions live in `lib/surveys.ts`

## Local Setup

1. Install dependencies:

```bash
npm install
```

1. Create local env file from template:

```bash
cp .env.local.example .env.local
```

1. Fill required values in .env.local (Supabase, Stripe, email, auth secrets).

1. Start development server:

```bash
npm run dev
```

## Scripts

- npm run dev: local development
- npm run build: production build validation
- npm run start: run production build locally
- npm run lint: ESLint checks
- npm run typecheck: `tsc --noEmit`
- npm test: unit tests for the payment and email logic

CI (`.github/workflows/ci.yml`) runs typecheck → lint → test → build on every PR and push to
`main`. Dependabot opens grouped npm and GitHub Actions updates weekly.

## Environment and Secrets

- Never commit live secrets.
- Keep .env.local and production values in Vercel environment variables.
- Rotate any secret immediately if it was ever committed or shared.
- Treat credentials and pins as compromised if present in git history.

## Deployment

- Platform: Vercel
- Branch: main
- Build command: npm run build
- Runtime requirements: Node 22+

After deploy, verify:

1. Public registration and spectator RSVP submit successfully.
2. Stripe webhook endpoint receives signed events.
3. Admin dashboard authentication and event flags work.
4. Policies page renders and links are valid.

## SEO and Crawl Controls

The app includes:

- app/robots.ts: crawler directives and sitemap pointer
- app/sitemap.ts: static route sitemap for key pages
- app/layout.tsx: site-wide metadata (`metadataBase` from NEXT_PUBLIC_BASE_URL, title template
  `%s · VSYC-26`, post-event Event JSON-LD)
- a small `layout.tsx` beside each page sets that page's title

Personal and day-of pages (`/portal`, `/player`, `/staff`, `/judge`, `/dj`, `/upload`, `/confirm`,
`/admin-dashboard`, `/spectators/portal`) and `/survey/*` are `noindex` and not in the sitemap.

If the base domain changes, update NEXT_PUBLIC_BASE_URL and redeploy.

## Security Notes

- CSP and security headers are configured in next.config.js
- Rate limiting is applied to public write routes, including checkout and player signup
- Admin/staff route guards enforce role checks server-side (no shared admin password or PIN)
- Errors go to Sentry when `NEXT_PUBLIC_SENTRY_DSN` is set
- Stripe webhook verifies signatures using STRIPE_WEBHOOK_SECRET

## Free Tier Stability Profile

This project is tuned for free tiers across Vercel, Supabase, Redis/KV, and Resend.

- In-memory singleton clients reduce per-request setup overhead (Supabase and Resend).
- Public list pages use ISR at 5-minute windows to cut repeated DB reads.
- Event flags use a short in-memory cache (default 30s) to reduce repeated flag queries.
- Rate limiting fails open on KV outages so registration does not hard-fail during provider incidents.
- Email send waits are bounded so slow provider calls do not consume excessive serverless runtime.

### Optional Runtime Knobs

- EVENT_FLAGS_CACHE_TTL_MS: event-flag cache TTL in milliseconds (default 30000).
- Keep this low during event-day live ops, higher during normal periods to reduce DB reads.
- HEALTHCHECK_TOKEN: required token for deep DB health checks at /api/health?deep=1.

### Crawler and Abuse Controls

- API crawler gate in middleware blocks obvious bot-like GET requests to API routes.
- /api/validate-code only accepts POST to avoid crawler-triggered code probing.
- /api/health is shallow by default (no DB call); deep DB probe requires HEALTHCHECK_TOKEN.
- robots.txt disallows /api and admin routes for compliant crawlers.

### Recommended Launch Defaults

1. Keep online registration open flag and results publish flag controlled via admin dashboard.
2. Monitor Vercel function duration and invocation spikes during announcements.
3. Monitor Supabase project usage and query spikes on competitor/spectator listing pages.
4. Treat Redis/KV rate limiting as best-effort protection, not a hard dependency.
5. Ensure Resend is configured before launch; if unavailable, registrations still complete.

## Project Structure

- app/: pages and API routes
- components/: UI and dashboard components
- lib/: pricing, auth, Supabase, Stripe, and utility modules
- supabase/migrations/: schema and policy migrations
- docs/: guides, roadmap, specs, payment documentation
- .github/workflows/db-backup.yml: nightly age-encrypted database dump (off until its secrets are set)

## Docs

- [docs/REPO_GUIDE.md](docs/REPO_GUIDE.md) — architecture and file map for new contributors
- [docs/ROADMAP.md](docs/ROADMAP.md) — open work and owner actions, in priority order
- [docs/STRIPE_PAYMENTS.md](docs/STRIPE_PAYMENTS.md) — payment flow, refunds, reconciliation
- [docs/specs/idea-board.md](docs/specs/idea-board.md) — planned `/ideas` board for VSYC-27
- [supabase/migrations/README.md](supabase/migrations/README.md) — how migrations are named and applied
- [docs/REGISTRATION_AUDIT.md](docs/REGISTRATION_AUDIT.md), [docs/claude-code-specs.md](docs/claude-code-specs.md) — historical (June and Sept 2026)

Issues are off on this repo; contest-app work is tracked on the club site repo with a
`[VA-States]` prefix ([umbrella issue #78](https://github.com/dmvthrowers/dmvthrowers.github.io/issues/78)).

The full October 2026 technical audit (security assessment, runbooks, repo specs) lives in the
club's Google Drive: [Technical docs - Oct 2026](https://drive.google.com/drive/folders/1Jt7amThKNkeVJenksPtA87cBtR-nwZiq)
(access-restricted — ask the coordinator).

## License

See LICENSE.
