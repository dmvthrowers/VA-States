# VA-States (VSYC-26 Registration)

Production registration and operations app for the Virginia State Yo-Yo Contest 2026.

Primary domain: <https://register.dmvthrowers.club>

## Stack

- Next.js App Router (TypeScript)
- Supabase (auth + Postgres)
- Stripe Checkout + webhooks
- Vercel deployment
- Tailwind CSS

## Core Features

- Competitor registration flow with pricing engine and discount codes
- Spectator RSVP flow with optional public profile
- Staff/admin auth and event operations dashboard
- Run-order management and results publishing controls
- Stripe payment capture with webhook reconciliation
- Policy page and event metadata for discoverability

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
- app/layout.tsx metadata with canonical support via NEXT_PUBLIC_BASE_URL

If the base domain changes, update NEXT_PUBLIC_BASE_URL and redeploy.

## Security Notes

- CSP and security headers are configured in next.config.js
- Rate limiting is applied to sensitive API routes
- Admin/staff route guards enforce role checks server-side
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
- docs/: ops and payment documentation

## Operational Docs

- docs/REGISTRATION_AUDIT.md
- docs/STRIPE_PAYMENTS.md

## License

See LICENSE.
