# Spec: Public idea board at `/ideas` (v2.1)

**Status:** planned, not started · **Target:** VSYC-27 planning season
**Source:** "hardened v2" spec from the October 2026 audit, revised 2026-10-02 against the
current code. Changes from v2 are listed at the end.

## Goal

A public, no-login idea board for VSYC-27 and beyond, hardened for a hostile internet:
bot-resistant intake, queued writes so floods hit the queue and not Postgres, and no public
write path to the database. Seeded with the 19 open VSYC-27 issues on the site repo (#76–#96).

## Non-goals

- No voting, reactions, comments or user accounts.
- No automatic GitHub sync — good ideas get promoted to issues by hand.
- No email notification per submission (a daily digest is a stretch item).
- Don't touch checkout, webhooks, registration or auth flows. No new paid services.

## Architecture

```
Browser → POST /api/ideas  (Turnstile token + honeypot + Idempotency-Key)
  → verify Turnstile (Cloudflare siteverify)
  → honeypot / validation / link heuristic
  → Redis: idempotency → dedupe → rate limits
  → QStash publish (signed) → 202 { status: "queued" }
QStash → POST /api/queues/ideas  (signature-verified)
  → service-role insert into ideas → audit log
```

The browser never writes to Postgres. The anon role gets SELECT-only RLS.

## Data model

New migration created with `supabase migration new idea_board` (or `apply_migration`), so the
filename carries the version production records — see `supabase/migrations/README.md`. Label it
`0037_idea_board`.

```sql
create table ideas (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 4 and 120),
  description text not null check (char_length(description) between 10 and 2000),
  category text not null check (category in
    ('venue','judging','volunteers','program','outreach','tech','community')),
  submitter_name text check (char_length(submitter_name) <= 60),
  submitter_email text,                 -- admin-only; never returned by public endpoints
  status text not null default 'new'
    check (status in ('new','planned','done','declined')),
  source text not null default 'community'
    check (source in ('community','github')),
  github_issue_number int,              -- seeded rows only
  hidden boolean not null default false,
  idempotency_key text unique,          -- NULL for seeded rows
  created_at timestamptz not null default now()
);
create index ideas_visible_recent on ideas (created_at desc) where (hidden = false);

alter table ideas enable row level security;

-- Anon reads visible rows only. There is deliberately NO insert/update policy.
create policy "public read visible ideas" on ideas
  for select to anon, authenticated using (hidden = false);

-- Column-level: anon must not be able to select submitter_email at all.
revoke select on ideas from anon, authenticated;
grant select (id, title, description, category, submitter_name, status, source,
              github_issue_number, hidden, created_at) on ideas to anon, authenticated;
```

Migration `0032` revoked anon table access across the schema; the explicit column grant above
is what re-opens the public read for this one table.

### Seed (same migration)

All rows: `source='github'`, `status='new'`, `hidden=false`, `idempotency_key=NULL`. Cards link to
`https://github.com/dmvthrowers/dmvthrowers.github.io/issues/<N>`.

| # | Title | Category | One-line description |
|---|---|---|---|
| 79 | [VA-States] Music upload: per-division tracks + lo-fi fallback | tech | Multi-division players overwrote their own music (`divisions[0]` naming); add per-division tracks + fallback |
| 77 | Replace JotForm with our own sponsorship form | tech | JotForm embed blocked by ad blockers, privacy browsers and CSP |
| 78 | VSYC-27 lessons learned tracker | program | Umbrella tracker for registration, music, judging, day-of workflow |
| 96 | Livestream viewer wishlist | tech | Score/ranking overlays, more camera angles, commentary |
| 95 | Conduct-concerns process | program | Named review group, deadlines, decision process — before the contest |
| 94 | Partner follow-ups | outreach | Dulles Town Center re-host, sponsor recaps + KPI packages, new connections |
| 93 | Press outreach | outreach | 2026 addresses bounced; one pitch per outlet |
| 92 | Venue floor plan | venue | Practice zone, judge sightlines, live schedule board |
| 91 | Judge panel | judging | Confirm and publish early, with backups (1A was finalized day-of in 2026) |
| 90 | Volunteer experience | volunteers | Role cards, shifts, briefing email (comms scored 3/5) |
| 89 | Prizes and awards | program | Podium trophies, yo-yo-first prizes, awards right after each division |
| 88 | Hotel room block | venue | Cover Fri + Sat, grow it, promote earlier (3-room block filled) |
| 85 | New programming ideas | program | Beginner workshops, lunchtime sleeper contest, AP/doubles — feasibility |
| 84 | Run of show | program | Schedule order, battles finale, night-before checks |
| 83 | [VA-States] Judging portal upgrade | tech | Live score status, head-judge lock/unlock, audit log |
| 82 | [VA-States] Champion identification | tech | Capture VA eligibility at registration instead of by hand |
| 81 | [VA-States] Sport division split | program | Youth vs Adult when Sport > 15 players (rule decided) |
| 80 | [VA-States] Round format | program | Prelims over 25, semis only over 50 (rule decided) |
| 76 | Archive VSYC-26, reset for VSYC-27 | tech | Own section for 2026; reset contest pages (target: October) |

## Dependencies and env vars

- `@upstash/qstash` is **already installed** (used by `lib/qstash.ts` for the email-drain
  backstop). Reuse `isSignedByQstash()` for the worker; add a publish helper next to it.
- Upstash KV is already used for rate limiting.
- New env vars (Vercel + `.env.local.example`):
  - `QSTASH_TOKEN` — publish to the queue. (`QSTASH_CURRENT_SIGNING_KEY` /
    `QSTASH_NEXT_SIGNING_KEY` already exist.)
  - `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — the YoYo Map already uses the same
    pair; copy its server-side verify helper rather than writing a new one.
- **CSP:** `next.config.js` must allow Turnstile: add `https://challenges.cloudflare.com` to
  `script-src` and `connect-src`, and add a `frame-src https://challenges.cloudflare.com`
  directive. Without this the widget silently fails to load.

## API routes

Conventions: `lib/api-error.ts` (`apiError`, `withErrorHandling`), `lib/rate-limit.ts`
(`checkRateLimit`, `getClientIp`), `lib/auth/admin-request.ts` (`requireAdminRequest`),
`lib/audit.ts`, `lib/supabase/admin.ts`.

### `POST /api/ideas` — intake (no DB write)

1. Reject bodies over 16 KB with 413.
2. Verify the Turnstile token server-side. Missing/invalid → 403 `submission_rejected`
   (generic — don't tell bots which check failed).
3. Honeypot field (`website`) must be empty → same generic 403.
4. Validate with zod: title 4–120, description 10–2000, category in the list, optional email
   must be email-shaped, name ≤ 60. Failures → 400 envelope.
5. Count URLs in title + description; **more than 5 → enqueue with `hidden=true`**
   (quarantine for review, not a rejection).
6. Require an `Idempotency-Key` header (client UUID v4). Seen within 24h → return **202** with
   the same body as the first call (the row may still be in the queue). Else reserve the key.
7. Dedupe on `sha256(normalized title + description)` for 24h → 409 `duplicate`.
8. Rate limits: 3/hour/IP, plus a global cap (100/hour, using a fixed key in place of the IP).
   Note `checkRateLimit` fails open when KV is down, so the global cap is best-effort.
9. Publish to QStash → `POST /api/queues/ideas` (absolute `NEXT_PUBLIC_BASE_URL` URL). Return
   **202** `{ status: "queued" }`.

### `POST /api/queues/ideas` — the only writer

1. Verify the QStash signature (current + next key). Invalid → 401, nothing processed.
2. Re-validate the payload (cheap defense in depth).
3. Insert with the service-role client. A unique violation on `idempotency_key` means it's
   already done → 200.
4. `logAudit('idea_submitted', { actor: 'idea-queue', details: { idempotency_key, hidden } })`.

### `GET /api/ideas` — public read

Params `category`, `status`, `limit` (default 50, max 100), `cursor` (`created_at`). Returns visible
ideas **without `submitter_email`**. 60/min/IP. Anon client.

### `PATCH /api/admin/ideas/[id]` — moderation

`requireAdminRequest` (fails closed). Body: `status` and/or `hidden`. Service-role client.
Audit-log every change. No hard delete — `hidden=true` is removal.

## UI

- `app/ideas/page.tsx` (+ `layout.tsx` with `title: 'Idea Board'`) — "VSYC-27 Idea Board",
  subtitle "Community ideas for next year's contest — add yours, no account needed." Category
  chips, status filter, cards with title, truncated description, category, status badge, and a
  "GitHub #N" link on seeded rows.
- Form: title, category, description with live character counts, optional name, optional email
  ("Only so we can follow up — never published."), invisible Turnstile, hidden honeypot. Generate
  a new `Idempotency-Key` per submit click so a double-click can't create two ideas.
  On 202: "Thanks — your idea will appear in a few seconds." On 409: "Looks like this was already
  submitted."
- Friendly empty state per filter. Reuse `NavBar`/`Footer` and existing Tailwind styles.
  Usable at 360px wide.
- Add `/ideas` to `app/sitemap.ts`.

## Admin

Add an "Ideas" section to `app/admin-dashboard` (no second auth surface): list with status and
hidden toggles, `submitter_email` visible here only, and a "needs review" view for quarantined
rows.

## Acceptance criteria

1. Migration applies cleanly. As anon: SELECT on visible rows works, INSERT is denied, selecting
   `submitter_email` errors.
2. Exactly 19 seeded rows with correct `github_issue_number`; `/ideas` renders 19 cards.
3. `POST /api/ideas`: bad/missing Turnstile → 403; filled honeypot → 403; bad fields → 400 with
   `requestId`; >16 KB → 413.
4. Same `Idempotency-Key` twice → one row.
5. Identical title + description within 24h → 409, nothing enqueued.
6. 4th submission in an hour from one IP → 429; global cap trips under a synthetic loop with a
   low test threshold.
7. Forged queue request → 401, no insert. Valid signed delivery → row + audit entry.
8. `GET /api/ideas` JSON never contains `submitter_email`.
9. Six URLs → 202 but `hidden=true`.
10. `PATCH /api/admin/ideas/[id]`: 401 without an admin bearer, 200 with; audit entry per change.
11. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` green; no behavior change to
    checkout, webhook or register.
12. Usable at 360px.

## Delivery plan

1. Migration + seed.
2. Queue worker with signature check, insert, audit log.
3. Intake route.
4. Read route + `/ideas` page + form.
5. Admin moderation section.
6. Stretch: daily digest via a QStash schedule + Resend (separate PR if it grows).
7. Test: **preview deployments are disabled** in `vercel.json`, so run the acceptance checks
   locally against a Supabase branch (or temporarily enable a password-protected preview for this
   branch) — not against production.

Keep the diff focused: no dependency changes, no Next bump, no unrelated refactors.

## Changes from v2

- `@upstash/qstash` and the QStash signing keys already exist — only `QSTASH_TOKEN` is new.
- Migration naming follows `supabase/migrations/README.md` (production-recorded version), not a
  hand-written timestamp.
- Added a column-level grant so anon can't read `submitter_email` (RLS alone filters rows, not
  columns), and noted that migration `0032` revoked anon access by default.
- Added the CSP changes Turnstile needs.
- Idempotent replays return 202, not "the existing record", because the row may still be queued.
- Admin auth is `requireAdminRequest` (Supabase staff bearer), not `lib/auth/staff.ts` directly.
- Testing can't use a preview deploy (previews are off); test locally or on a protected preview.
- The Next bump this spec said to leave alone has since landed (15.5.27).
- Settings notes go in this repo's docs, not a separate asset inventory.
