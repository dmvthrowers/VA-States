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
