<!--
  Reference copy of the VA-States Claude Code spec, added 2026-10-01.
  The spec below is verbatim. Status as of 2026-10-01:
  1. charge.refunded handler        -> merged in #19 (Stripe Dashboard must also send charge.refunded)
  2. tsc --noEmit in CI             -> merged in #20
  3. Migration numbering            -> #22: files renamed to match production versions; labels documented, not renumbered
  4. Lint gates the production build -> merged in #21
  The "no GitHub token" delivery note is outdated: PRs were opened from the session.
  Still-open follow-ups from the same audit are tracked in docs/ROADMAP.md.
-->

---

# VA-States — Claude Code specs

Repo: `dmvthrowers/VA-States` (contest registration, register.dmvthrowers.club).
Next.js 15 App Router + TypeScript, Supabase (isolated project), Stripe Checkout + webhook reconciliation, Resend, Vercel (iad1). Live production app for VSYC-26, now in post-event wrap-up. Docs are strong — README, STRIPE_PAYMENTS.md, `.env.local.example`, AGENTS.md cold-start. Read AGENTS.md before starting. **This is a payments app: every change below gets extra care around money.**

**Delivery mechanism (all items below):** Work on a `claude/<short-name>` branch, push the branch, and report PR-ready state (branch name + summary + test evidence) to Brandon, who reviews and merges on GitHub. You do not have a GitHub token; do not try to open issues or PRs via the API or authenticated CLI.

---

## 1. Handle `charge.refunded` in the Stripe webhook [PRIORITY: highest of all three repos' items]

**Context:** This is a production payments app and Stripe webhook handlers move money. A Dashboard refund currently leaves a registration marked `paid=true` — wrong financial state. **This item is the highest-priority item across all three repos' specs.**

**Task:**
1. Find the Stripe webhook route (the file handling `checkout.session.completed` — read STRIPE_PAYMENTS.md first for the documented flow).
2. Add an idempotent handler for `charge.refunded` that mirrors the existing `checkout.session.completed` pattern:
   - Verify the Stripe webhook signature exactly as the existing handlers do (same code path, no new verification logic).
   - Look up the registration by the Stripe charge/payment-intent ID stored on it.
   - Set the registration's paid status to reflect the refund (match the schema's existing convention — check how `paid` is stored and whether partial refunds need a distinct state; full refund = not paid).
   - Idempotency: handle duplicate delivery of the same event (check the event ID against whatever dedup the existing handlers use, or add the same mechanism).
   - Log the refund the same way the codebase logs other payment events.
3. Update `STRIPE_PAYMENTS.md` with a short section documenting the new event, its handler, and the resulting registration state for full vs. partial refunds.
4. Write a test if the repo has a webhook test harness; if not, add a minimal unit test for the handler's state-transition logic (not a live Stripe call).

**Acceptance criteria:**
- `charge.refunded` received via the existing webhook endpoint flips a fully-refunded registration off paid status; duplicate deliveries don't double-apply.
- Partial-refund behavior is defined and documented (either handled or explicitly documented as out of scope with a reason).
- STRIPE_PAYMENTS.md documents the new event and states.
- Existing webhook tests still pass; CI green.

**Constraints/risks:**
- Do not change the `checkout.session.completed` handler's behavior.
- Do not alter the database schema unless the existing `paid` representation genuinely can't express "refunded" — and if you do, that's a separate migration with Brandon's explicit approval first.
- Never log full card numbers, raw Stripe secrets, or customer PII in the new logging.
- Test with Stripe's test-mode events or fixtures only. No live Dashboard refunds as "testing."

---

## 2. Add `tsc --noEmit` to CI

**Context:** CI currently runs lint + build only — no standalone typecheck. In a payments codebase, a type error that Next's build happens to tolerate is a silent risk.

**Task:**
1. Add a `typecheck` script (`tsc --noEmit`) to `package.json`.
2. Add a CI step/job that runs it, positioned to fail the workflow on type errors (same pattern as the existing lint job).
3. Run it locally first and fix every error it surfaces — real fixes, no `@ts-ignore`/`@ts-expect-error` additions unless the codebase already uses that pattern for the same case.

**Acceptance criteria:**
- `tsc --noEmit` runs in CI and fails the workflow on type errors.
- CI is green on the branch after any fixes.
- No new `@ts-ignore` / `@ts-expect-error` comments introduced.

**Constraints/risks:**
- Don't weaken `tsconfig.json` strictness to make the gate pass.
- If the error count is large, fix them in the same branch but list every changed file in the PR description so review is easy.

---

## 3. Normalize Supabase migration numbering

**Context:** Duplicate `0017` prefixes and skipped `0024`/`0025` against a live production database. Renumbering migrations against a live DB is dangerous if done wrong.

**Task:**
1. List every migration file and its prefix. Identify the duplicates (`0017` x2) and the gaps (0024/0025).
2. **Verify against the live applied-migration log first.** The `migrate.yml` workflow auto-applies migrations — read it to find how applied migrations are tracked (Supabase `supabase_migrations` table or equivalent). You likely cannot reach the production DB without credentials; if you can't verify, STOP and report that to Brandon with the proposed renumbering plan — do not renumber blind.
3. If verification is possible: renumber so the sequence is gap-free and duplicate-free, with **file contents byte-identical** (rename only). The renumbered set must be a no-op re-apply against the live DB (Supabase tracks by content hash in most setups — confirm this from the migrate workflow before proceeding).
4. If the live DB tracks by filename rather than hash, a pure rename is NOT safe — report that finding instead of renaming.

**Acceptance criteria:**
- Either: migrations renumbered, contents byte-identical, verified a no-op re-apply against the applied-migration log, CI green — or: a written report explaining exactly why the rename is unsafe and what Brandon needs to do (e.g., provide DB access or run a manual fix).
- No migration content altered in any case.

**Constraints/risks:**
- **Do not touch migration file contents.** Renames only.
- Do not run migrations against the production database yourself under any circumstances.
- When in doubt, report instead of acting. A botched migration history on a live payments DB is the worst outcome here.

---

## 4. Make lint gate the production build

**Context:** `next.config` currently sets `eslint: { ignoreDuringBuilds: true }`, so a skipped or failed lint in CI can still ship lint errors to production.

**Task:**
1. Remove `eslint: { ignoreDuringBuilds: true }` from the Next.js config.
2. Run the production build locally (`next build`). Fix every lint error that now fails the build — real fixes, no new `eslint-disable` comments.
3. Confirm the existing CI lint job and the build both pass on the branch.

**Acceptance criteria:**
- The `ignoreDuringBuilds` escape hatch is gone from the config.
- `next build` passes with lint errors fatal.
- CI lint job and build both green.
- No new `eslint-disable` comments introduced.

**Constraints/risks:**
- If fixing the surfaced lint errors touches payment-related code, keep the diff minimal and call it out explicitly in the PR description for careful review.
- Don't change any other build config (no touching `typescript.ignoreBuildErrors` if present — that's item 2's territory).
