# VSYC-26 Registration App — Readiness Audit

**Date:** June 7, 2026
**Repo:** `dmvthrowers/VA-States` (Next.js 15 + Supabase + Vercel)
**Goal:** A registration site + judge/DJ dashboards + competitor list + integrated payment, taking good ideas from compete.yoyocontest.com without copying it.

---

## Bottom line

You already have ~80% of the target built. The current Next.js app is far more than a registration page — it's a near-complete contest operations system. The **one true missing capability is integrated online payment**. The rest is polish, content sync, and deployment.

---

## Target capability checklist

| # | Capability you asked for | Status | Where it lives |
|---|--------------------------|--------|----------------|
| 1 | Registration site | ✅ Built | `app/page.tsx`, `app/api/register/route.ts` |
| 2 | Fee calculation (combo, early-bird, walk-up, comp) | ✅ Built | `lib/pricing.ts`, `app/fee-calculator/page.tsx` |
| 3 | Music upload (DJ-facing) | ✅ Built | `app/upload`, `app/api/upload`, `app/dj` |
| 4 | Judge scoring dashboard | ✅ Built | `app/judge`, `app/api/scores`, `vsyc_scores` |
| 5 | Run order / day-of ops | ✅ Built | `app/admin/run-order`, `vsyc_run_order` |
| 6 | "Who's competing" public list | ✅ Built | `app/competitors/page.tsx` |
| 7 | Admin suite (codes, paid, CSV, walk-up) | ✅ Built | `app/admin/*`, `app/api/admin/*` |
| 8 | **Integrated payment (Stripe/PayPal)** | ❌ **Missing** | — *manual today* |

---

## The gap: payment is 100% manual

**How it works now:**
- Registrant fills the form → record created with `paid = false`, `payment_method = 'pending'`.
- Confirmation page + email tell them to pay within 72 hours via `paypal.biz/Dmvthrowers` or Venmo `@DMVThrow`.
- An admin watches PayPal/Venmo, then manually hits **Mark Paid** (`app/api/admin/mark-paid`).
- No payment SDK in `package.json`. No checkout. No webhook. No reconciliation.

**Why this matters:** it's the highest-friction, highest-labor part of the whole flow, and the only place where your app meaningfully lags a platform like Compete. It also creates a window where a "registered" person hasn't paid, which complicates brackets and run order.

### Recommended fix: Stripe Checkout (hosted)

| Option | Pros | Cons |
|--------|------|------|
| **Stripe Checkout (recommended)** | Hosted page (PCI handled by Stripe), Apple/Google Pay, clean webhooks, great DX, easy refunds | 2.9% + $0.30; needs a business entity/bank |
| PayPal Checkout | You already use PayPal; familiar to registrants | Clunkier API/webhooks, weaker DX |
| Keep manual + add PayPal button | Zero rework | Still manual reconciliation; doesn't close the gap |

**Suggested architecture (Stripe):**
1. On register, create the record as `pending` (as today).
2. Server creates a Stripe Checkout Session for `fee_cents`; redirect to it. (Comp codes / $0 skip checkout entirely.)
3. Stripe webhook → on `checkout.session.completed`, set `paid = true`, `payment_method = 'stripe'`, `paid_at = now()`, log to `vsyc_audit_log`.
4. Confirm page reads real paid status; music upload link releases only after `paid = true`.
5. Keep **Mark Paid** for walk-ups / cash / check as a manual fallback.

**New work required:** add `stripe` dep, `app/api/checkout/route.ts`, `app/api/webhooks/stripe/route.ts`, a `payment_intent_id`/`checkout_session_id` column, env keys (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`), and a success/cancel return path. Roughly 1–2 focused sessions.

---

## Secondary gaps (content + deploy, not missing features)

1. **Live static page is not wired to the app.** `dmvthrowers.club/vsyc26-register.html` has all the marketing/divisions/payment copy but just links out to `register.dmvthrowers.club`. The static page lists a **Fixed Axle** division (TBD) that the **app does not support** — app divisions are only `1A`, `X`, `SBJ`. Decide whether Fixed Axle is in scope; if yes it touches the enum, pricing, validation, and DB constraint.
2. **Deployment unknown.** `register.dmvthrowers.club` is referenced everywhere — confirm it's actually live on Vercel with all env vars set (Supabase, Resend, KV, admin auth, cutoffs).
3. **Public results not surfaced.** You have the scoring backend (`vsyc_results` view) but no public standings page. This is the best idea to borrow from Compete — published results per division builds credibility and repeat traffic. Low effort given the data already exists.
4. **No competitor accounts.** Compete has persistent accounts across contests. For a single annual contest this is likely over-engineering — recommend **skipping** unless Mid-Atlantic YoYo plans multiple contests.

---

## Good ideas worth borrowing from compete.yoyocontest.com

- **Published results pages** per division (you can ship this now — data exists).
- **Division count + status badges** ("Open" / "Coming Soon") on the contest header.
- **Clear competitor-facing flow**: register → pay → upload music → see yourself on the competitor list, as one connected journey rather than separate pages.
- *(Skip for now)* multi-contest browse, user accounts, video galleries — not worth the rearchitecture for one annual event.

---

## Recommended next steps (priority order)

1. **Decide payment processor** (Stripe recommended) — unblocks the only real gap.
2. **Confirm production deploy** of `register.dmvthrowers.club` + env vars.
3. **Resolve Fixed Axle** scope (in the app, or keep "TBD/stay tuned" only).
4. **Build Stripe Checkout + webhook**, keep Mark Paid as fallback.
5. **Ship a public results page** off the existing `vsyc_results` view.
6. **Sync register-page polish** (sticky live fee summary, mobile pass) into the app.

---

## Open questions for Brandon

- Stripe, PayPal, or stay manual for now?
- Is **Fixed Axle** a real division for VSYC-26, or marketing "TBD" only?
- Is `register.dmvthrowers.club` already deployed and configured, or does that still need doing?
- Any plan for **future contests** (Mid-Atlantic YoYo) that would justify accounts/multi-contest — or is single-event the design point?
