# VSYC-26 — Stripe Payments Setup & Deploy Guide

This adds **integrated online card payment** (Stripe Checkout) to the registration
flow. Comp / $0 registrations skip payment entirely; everyone else is sent to a
hosted Stripe Checkout page and marked paid automatically by webhook. The old
manual Venmo/PayPal/check flow remains as a fallback on the confirmation page.

---

## What changed in the code

**New files**
- `lib/stripe.ts` — server-only Stripe client (`getStripe`, `hasStripeCredentials`).
- `app/api/checkout/route.ts` — `POST { id }` → creates a Checkout Session for the
  registration's `fee_cents`, stores `checkout_session_id`, returns the hosted URL.
- `app/api/webhooks/stripe/route.ts` — verifies the Stripe signature and, on
  `checkout.session.completed`, sets `paid = true`, `payment_method = 'stripe'`,
  `paid_at`, `payment_intent_id`, `amount_paid_cents`. Idempotent (safe on replay).
- `supabase/migrations/20260607_stripe_payment.sql` — adds `'stripe'` to the
  `payment_method` enum and the columns/indexes the webhook needs.

**Edited files**
- `app/page.tsx` — after a successful registration, if a fee is due and it isn't a
  comp, the browser is redirected to Stripe Checkout; otherwise it goes to `/confirm`.
- `app/confirm/page.tsx` — adds a **"Pay by card →"** button (Stripe) above the
  manual options, plus a "payment canceled" notice when returning from a canceled
  checkout.
- `package.json` — adds `stripe` dependency.
- `.env.local.example` — adds the Stripe env vars.

---

## 1. Run the database migration

In Supabase → SQL Editor, run `supabase/migrations/20260607_stripe_payment.sql`.
(The `ALTER TYPE ... ADD VALUE` and `ADD COLUMN IF NOT EXISTS` statements are safe to
re-run.)

## 2. Set up Stripe

1. Create / log into the Stripe account (use a real business entity + bank for live).
2. **Developers → API keys**: copy the Secret key (`sk_test_…` while testing).
3. **Developers → Webhooks → Add endpoint**:
   - URL: `https://register.dmvthrowers.club/api/webhooks/stripe`
   - Events: `checkout.session.completed` (optionally also
     `checkout.session.async_payment_succeeded`).
   - After creating it, copy the **Signing secret** (`whsec_…`).

## 3. Environment variables (Vercel → Settings → Environment Variables)

```
STRIPE_SECRET_KEY=sk_live_...          # or sk_test_ for the test deploy
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...   # reserved; not yet required
```
Plus all the existing vars from `.env.local.example` (Supabase, Resend, KV, admin
auth, `NEXT_PUBLIC_BASE_URL`, the cutoff dates).

## 4. Deploy (site is not yet live)

1. Push to `dmvthrowers/VA-States`.
2. Import the repo in Vercel, set the env vars above, deploy.
3. Point `register.dmvthrowers.club` (CNAME) at the Vercel deployment.
4. Vercel runs a clean `npm install` (pulls in `stripe`) + `next build`.

## 5. Test end-to-end (Stripe test mode)

1. Register with a fee due → should redirect to Stripe Checkout.
2. Pay with test card `4242 4242 4242 4242`, any future expiry, any CVC/ZIP.
3. Return to `/confirm?id=…&paid=1`; webhook flips `paid = true` within seconds.
4. Register with a valid comp code → no Stripe, straight to confirmation.
5. Check the **admin** view shows the registration as paid via `stripe`.

---

## Notes / decisions

- **Fixed Axle** stays marketing-only ("TBD") — not added to the app. App divisions
  remain `1A`, `X`, `SBJ`.
- **Manual Mark Paid** (`/api/admin/mark-paid`) is intentionally kept for walk-ups,
  cash, and check.
- **Refunds**: issue from the Stripe Dashboard. (A future enhancement could add an
  admin refund button + a `charge.refunded` webhook handler to flip `paid` back.)
- **Build verification was not run in this session** — the sandbox had a partial npm
  install and a file-sync glitch. Verify locally with `npm install && npm run build`,
  or rely on the Vercel build, before announcing registration is open.
