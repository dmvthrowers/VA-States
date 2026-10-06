# VA-States — Roadmap

Open work for the registration app, in priority order. Built from the October 2026 technical
audit; every status below was re-checked against the code on 2026-10-02. Update it as items
land. Issues are off on this repo, so contest-app items are tracked on the club site repo
(`dmvthrowers/dmvthrowers.github.io`) with a `[VA-States]` prefix under umbrella issue #78.

## Done since the audit (for the record)

| Item | Where |
|---|---|
| `charge.refunded` handled: full refund sets `paid=false`, partial is audit-logged | PR #19, `lib/stripe-refund.ts`, `docs/STRIPE_PAYMENTS.md` |
| A refunded session can't be re-marked paid by a webhook replay or the reconcile sweep | `lib/payment-decision.ts` (`ignore: 'refunded'`) |
| `tsc --noEmit` gates CI | PR #20 |
| Lint is fatal in `next build` (`eslint.ignoreDuringBuilds` removed) | PR #21 |
| Migration filenames match production's recorded versions | PR #22, `supabase/migrations/README.md` |
| Dependabot for npm (grouped) and GitHub Actions | `.github/dependabot.yml` |
| Sentry error reporting, job check-ins, nightly encrypted DB backups | PR #27, `db-backup.yml` |
| **Next 15.5.18 → 15.5.27** (clears 10 advisories incl. RCE-class) and `eslint-config-next` 15.0.3 → 15.5.27 | this PR |
| **Rate limit on `POST /api/checkout`** (10/IP/15 min) and `POST /api/player-auth/signup` (5/IP/hr) | this PR |
| Unused `/api/dj/auth` PIN route deleted; `.env.local.example` no longer lists dead `ADMIN_*`/`*_PIN` vars and now lists `HEALTHCHECK_TOKEN`, `EVENT_FLAGS_CACHE_TTL_MS` | this PR |
| Per-page `<title>`s, noindex on personal/ops pages, no site-wide canonical, post-event JSON-LD (no "InStock" ticket offers) | this PR |

## Now (owner actions — dashboard, not code)

1. **Close registration for VSYC-26.** The site says registration is closed, but the app still
   accepts competitor and volunteer submissions 13 days after the event. Turn off
   `online_registration_open` in the admin dashboard's event flags (or set
   `ONLINE_REG_CUTOFF_ISO` in the past).
2. **Remove dead env vars from Vercel:** `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `DJ_PIN`,
   `JUDGE_PIN`. Nothing reads them.
3. **Confirm the Stripe webhook endpoint subscribes to `charge.refunded`** (Dashboard →
   Developers → Webhooks). Code handles it; Stripe only sends subscribed events.
4. **Turn on backups:** set `SUPABASE_DB_URL` (secret) and `BACKUP_AGE_RECIPIENT` (variable) so
   `db-backup.yml` runs, then do one test restore.
5. **Rotate staff accounts after the event:** deactivate contest-day judge/DJ/audio-tech rows in
   `vsyc_staff_accounts` that no longer need access.

## Next (code, this quarter)

6. **Handle Stripe disputes.** No `charge.dispute.*` handler: a chargeback leaves the
   registration `paid=true` and nobody is alerted. Add `charge.dispute.created` (and
   `.closed`): audit log, email `ADMIN_ALERT_EMAIL`, flag in `vsyc_payment_flags`. Subscribe the
   event in Stripe. Pure-logic test like `stripe-refund.test.mjs`.
7. **Music, the rest of site issue #79.** One track per division is done (`vsyc_music`, per
   division slots, replace confirmation, audit log). Still open: the lo-fi fallback for empty
   slots at the deadline (needs a cleared lo-fi pool in `vsyc26-music/lofi/`), per-division
   reminder emails before the deadline, expected routine length per division/round for the DJ
   view (site issue #80), and dropping the old `music_path` / `music_filename` columns.
8. **Rate-limit the admin routes.** Admin auth is a Supabase JWT plus an active staff row, so
   there's no password to guess here — this is about cost and abuse (each call hits Supabase
   Auth). A shared 60/IP/min limit inside `requireAdminRequest` is enough.
9. **Route-level tests for the money paths:** `/api/register` validation branches and webhook
   dispatch (completed, refunded, bad signature).
10. **CI action versions:** `actions/checkout@v4` and `actions/setup-node@v4` in `ci.yml` are
    behind; Dependabot's Actions group should pick these up — merge it when it lands.
11. **Form label association:** the `Field` component in `app/page.tsx` renders `<label>`
    without `htmlFor`, so screen readers don't tie labels to inputs.
12. **Results data gaps** seen on `/results` (Oct 2): 1A missing ranks 1–9, X Division without
    rank numbers, two scores without a competitor name, some missing scores and cities. Check
    the official-results import rows.

## VSYC-27 features (from site issues #78–#83)

- Round format: prelims over 25 players, semis only over 50 (#80, rule decided). The app
  supports rounds now (`rounds` on a division in `contest.config.ts`, migration 0039).
- Sport division split Youth/Adult when Sport has more than 15 players (#81, rule decided).
- Virginia State Champion per division (#82): **built** (home-address residency at registration, DC as its own state, per-division champion on `/results`, prize/survey list, admin override and filter; migration 0047). Not done: publish the rule on the site's rules page, and confirm the prize count once the division list is locked (3 divisions × (3 podium + 1 champion) = 12).
- Judging portal: live score status, head-judge lock/unlock, audit log (#83).
- Public idea board at `/ideas` — spec in `docs/specs/idea-board.md`.

## Later (separate projects — don't bundle)

- **Dependency majors, deferred (Oct 5):** Next 16, React 19, Tailwind 4 and `lucide-react` 1
  landed (PRs #40, #34, #38, #35, #51–#53). Still open, here and in yoyo-registration-template:
  ESLint 10 (#37 here; wait until `eslint-config-next` supports it), `resend` 6,
  `@vercel/analytics` 2, `zod` 4 (optional). Defer `stripe` 17 → 23 until there's a reason.
- **TypeScript 7:** wait for 7.1 (stable JS API); a straight bump breaks ESLint type-aware rules
  and Next's build-time type check.
- Replace `@vercel/kv` (deprecated) with `@upstash/redis` when `lib/rate-limit.ts` is next touched.

## Accepted risks

- Rate limiting fails open if KV is down — registration must not hard-fail on a provider
  outage during a contest.
- A `charge.refunded` that arrives before the payment was ever recorded is a no-op, so a later
  `checkout.session.completed` would mark that registration paid. Very unlikely in practice;
  the reconcile sweep's refunded check doesn't apply because no `payment_intent_id` was stored.
  Revisit if it ever happens.
