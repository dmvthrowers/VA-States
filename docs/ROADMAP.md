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

| Migration replay in CI (`migrations` job, `scripts/check-migrations.sh`), `npm run divisions` + `supabase/divisions.sql`, and the template's `divisions-core`, `formats` and `routine-length` tests | build plan 4.2, `supabase/migrations/README.md` |

## Where things stand (2026-10-06)

- **Production database:** every migration through 0047 is applied (checked read-only on 2026-10-06: the four
  home-state columns and constraints exist, and the backfill matches: 18 Virginia registrations, 18 confirmed,
  no overrides).
- **Merged:** the VSYC-27 feature set above, the finance roadmap entry and the sponsor-form roadmap entry. The
  registration template has the roles and portals work (grants table, `/staff` single pane, staff and roles
  screen, sponsors, stream, media, MC, merch, volunteers, finance and event-setup screens).
- **Not ported yet:** battles, round plans, disputes, split, champion, prizes and score status exist here but not in
  the template.
- **Decisions waiting on the owner:** sponsor form details (below), 2026 archive and purge retention, prize scale.

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

6. **Stripe disputes: built, needs two owner steps.** `charge.dispute.created` / `.closed` open and
   close a flag in `vsyc_payment_flags`, write the audit log and email `ADMIN_ALERT_EMAIL`; the
   registration is never changed automatically. To go live: apply migration 0046, then subscribe
   the two events on the Stripe webhook endpoint. Details: `docs/STRIPE_PAYMENTS.md`.
7. **Music (site issue #79): built, waiting on three owner steps.** Tracks per slot (rounds,
   battles), replace confirmation, lo-fi fallback, per-division reminders, routine length and the
   DJ timer are done (PRs #64/#65; run migration 0044 first). Still to do: put cleared lo-fi tracks
   in `vsyc26-music/lofi/`, and drop the old `music_path` / `music_filename` columns once a contest
   has run on the new tables.
8. **Rate-limit the admin routes.** Admin auth is a Supabase JWT plus an active staff row, so
   there's no password to guess here — this is about cost and abuse (each call hits Supabase
   Auth). A shared 60/IP/min limit inside `requireAdminRequest` is enough.
9. **Route-level tests for the money paths:** `/api/register` validation branches and webhook
   dispatch (completed, refunded, bad signature).
10. **CI action versions:** `actions/checkout@v4` and `actions/setup-node@v4` in `ci.yml` are
    behind; Dependabot's Actions group should pick these up — merge it when it lands.
11. **Form label association: done** (this PR). `Field` already tied labels to inputs; the gaps were
    18 sibling labels on the sign-in forms (`/judge`, `/dj`, `/player`, `/admin-dashboard`,
    `/staff/profile`), the spectator portal, the comp code fields and the judge notes box, plus
    the walk-up form's `Field` wrapper. Same fix in yoyo-registration-template.
12. **Results data gaps** seen on `/results` (Oct 2): 1A missing ranks 1–9, X Division without
    rank numbers, two scores without a competitor name, some missing scores and cities. Check
    the official-results import rows.

## VSYC-27 features (from site issues #78–#83)

- Round format by entrant count (#80): **built** (`roundPlan`, the Round plans panel, ties at the
  cut, advancement into the run order and DJ queue; migration 0045). To use it, paste the
  `roundPlan` block from `docs/REPO_GUIDE.md` into 1A and X in `contest.config.ts` after the 2026
  archive, so it doesn't touch 2026 results. Still open: update the site's rules page (#76) and the
  run of show (#84), and the schedule items for semi-finals.
- Battles on `/dj`: **built** (cue the live match, play both entrants' battle tracks). Not used by
  VSYC yet: it needs a bracket division with `music: { routine: false, extra: [...] }`.
- Virginia State Champion per division (#82): **built** (home-address residency at registration, DC as its own state, per-division champion on `/results`, prize/survey list, admin override and filter; migration 0047). Not done: publish the rule on the site's rules page, and confirm the prize count once the division list is locked (3 divisions × (3 podium + 1 champion) = 12).
- Judging portal (#83): **live score status and a ready-to-publish check are built** (read-only, never blocks a publish). Still waiting on the judges' debrief the issue asks for before building head-judge lock/unlock, structured deduction notes, offline-tolerant submission and category breakdowns.
- Public idea board at `/ideas` — spec in `docs/specs/idea-board.md`.

## Finance and budget upgrade (planned)

Today's budget is flat income and expense entries in three categories, one fundraising goal and a public
transparency page. The plan is a proper budgeting tool: plan versus actual by category and line, break-even
forecast from the price list and prize plan, expenses with vendors and receipts and reimbursements, income fed
from registrations, merch and sponsors (net of fees, refunds and disputes), cash flow and deadlines, per-event
budgets and copy-forward, and statements and accountant exports. It is a role (`finance`) so a treasurer can run
it without full admin. The full design and stages are in the registration template's `docs/HUB_ROADMAP.md`
("Finance and budget"); this app gets it when it lands there and is safe for the live contest.

## Sponsor inquiry form (planned; replaces the JotForm on the site)

A "Want to sponsor?" form hosted on our own systems instead of the JotForm embed on
`vsyc26-sponsors.html` (site issue #77). The static site can't take form posts, so the form lives in this app
at a public `/sponsor` page and the site links to it. Plan, built in the registration template first:

- **Fields** come from config (`contest.sponsors`: tiers and what each includes, in-kind option, optional
  budget range), so the same form works for any event. Contact name, organization, email, optional phone, tier
  or interest, a message. Plain labels, errors in second person, works at 360px, no third-party scripts.
- **Spam without tracking:** a honeypot field, a per-IP rate limit and server-side validation. No CAPTCHA
  service, no analytics on the form.
- **Where it lands:** a new `contest_sponsor_inquiries` table (service role only), separate from the sponsor
  pipeline so an unvetted submission never counts as money. Staff with `sponsors.manage` see new inquiries on
  `/sponsors` and press **Convert to sponsor** (prospect, with the message copied into notes) or **Dismiss**.
- **Email:** the organizer gets a notice, the sender gets a plain confirmation (same email layer as
  registration). The notice address is config, not code.
- **Retention:** inquiries hold people's contact details, so they get an owner in the season archive plan:
  converted ones live on in the pipeline, dismissed ones are deleted after a set time.
- **Switching over:** import the old JotForm submissions (CSV) into the pipeline as prospects, point the site's
  button at `/sponsor`, then remove the JotForm embed and its origins from that page's CSP.

**What the 2026 sponsor package already decides** (so the form mirrors it, not a new idea). The package lists six
tiers: Diamond ($2,000+ cash, 1 slot), Platinum ($500+, 2 slots), Gold ($250+, 4 slots), Silver ($75+, open),
Bronze ($50, open) and In-kind / local ($25+ in value, any form: product, services, gift cards, food). Gold, Silver
and Bronze can add product at retail value alongside the payment, and product-only gifts map to an in-kind
equivalent per tier ($500 / $150 / $75 retail). Each tier carries benefits (naming, table, MC shout-outs, logo
size on the banner, brand team players, social posts, livestream credit) and some are slot-limited, so the form
needs: tier choice with remaining slots shown, cash and/or product with a description and retail value, a table
add-on ($75, $50 for hobby clubs, 10 tables in total, included for Gold and above), brand team player names for
Diamond and Platinum, a logo upload (vector or 300 dpi PNG) with the August 15 deadline, shipping for advance
product (by September 12), and the contact and brand details. The package's flow is: form, then a PayPal invoice
(PayPal, Venmo, check or transfer; due within 14 days; sponsorships are final), then the logo goes out once
payment clears; paid sponsors get a recap within 14 days of the event. Dates and prices belong in config, since
they change every year.

What this means for the build: the inquiry table keeps the chosen tier, cash amount, in-kind description and
value, table request, team players, logo file and shipping needs; converting an inquiry creates the pipeline row
with the deliverables for that tier already filled in as a checklist (banner logo, MC shout-outs, social post,
Linktree, table, recap), which is what the sponsors screen already tracks. Slot counts (Diamond 1, Platinum 2,
Gold 4) are enforced against committed and paid sponsors.

Also from the outreach research (`Yo-Yo Brand Sponsorship Contact Directory`, early 2026): a contact list of 40+
active brands and retailers (priority list of 15, plus seven defunct or dormant ones to drop). That is outreach
data, not form data, so it should be imported into the sponsor pipeline as prospects (name, contact, notes,
status "prospect") rather than kept in a PDF. It contains third-party contact details, so import it only into the
admin-only pipeline, never into anything public.

**Decided (2026-10-06):** the form shows each tier's price and how many slots are left; sponsors pay whichever way is
easiest for them (the form only records how they would like to pay, and an invoice or link is sent after review, so
there is no online checkout to build); notices go to the VSYC inbox (`vastateyoyocontest@gmail.com`, set as
`SPONSOR_NOTICE_EMAIL`); and the form lives on the club's domain like the other tools, at
`register.dmvthrowers.club/sponsor`, with the club site's sponsors page linking to it (replacing the JotForm embed,
site issue #77).

**Status:** built in the registration template (PR #40) and ported here (admin-only, since this app has no organizer
role): the public `/sponsor` form, a small sponsor pipeline at `/sponsors`, and the tier and option editor at
`/sponsors/form`. The defaults in `contest.config.ts` are the 2026 package tiers; staff change them in the editor. To go
live: apply migrations 0048 and 0049 (new tables only), then set `SPONSOR_NOTICE_EMAIL` in Vercel.

**Still open for VSYC-27:** next year's tiers, prices and slot caps (the 2026 ones are above); whether an inquiry
should hold a slot for a few days; table add-on with a cap and the hobby-club price; brand team player names now or
after commitment; logo as a link or a real upload; permission to show the name publicly; shipping from outside the US;
whether the club is a registered nonprofit (receipts and in-kind letters); refund and payment-term wording on the form;
how long to keep dismissed inquiries. The full list is in the template's `docs/SPONSOR_FORM.md`.

Beyond the sponsor form, the same shape is meant to carry every public form (vendor and merch-table
applications, volunteer interest, media requests, feedback): forms defined in config, one public page, one
submission table, reviewed by the role that owns them, with the same spam, privacy and retention rules. Design:
the registration template's `docs/HUB_ROADMAP.md` ("Forms on our own system"). Not needed for VSYC-27 beyond
the sponsor form.

## Season archive and purge (plan for the 2026 → 2027 rollover)

Once VSYC-26 is archived (about a month after the event) the app should turn itself over for the
next contest: keep the results as static pages, delete the music and personal data, start clean.
Spec and open decisions: `docs/specs/season-archive.md`. Order of work:

1. **Freeze** — `npm run archive -- --season 2026` writes the public record (results per division
   and round, brackets, placements, public names only) as static HTML/JSON for the club site repo,
   as a PR to review. Nothing is published automatically.
2. **Verify** — a report compares counts against the database and scans the output for anything
   private (minors not opted in, emails, payment data).
3. **Purge** — `npm run purge -- --season 2026` is dry-run by default and refuses to run until
   the freeze is merged and a fresh encrypted backup exists. It removes the music bucket objects
   (never `lofi/`), music rows, scores, run orders, brackets, votes, teams, registrations and
   uploaded personal data, deactivates contest-day staff, and writes an audit record of counts.
4. **Reset** — bump the season in `contest.config.ts`, re-sync divisions, clear event flags and
   comp codes, point music at a new bucket, apply the 2027 `roundPlan`.

Freeze and verify are built (`npm run archive`, `npm run archive:verify`; see the spec for how to run them). Purge and reset
are not started and need the retention decisions in the spec first (payment and waiver records).

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
