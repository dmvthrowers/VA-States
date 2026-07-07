# VSYC-26 auth email templates

Branded HTML for every Supabase Auth email type on the `vsyc26-registration`
project, matching the look of the Resend transactional emails in `lib/email.ts`
(navy `#0d1428` background, gold `#C9A84C` accent, gold top border card).

There's no API to push these from here — paste each one into the
**Supabase Dashboard → Authentication → Email Templates** for project
`nsudnfscdcsatnrtaxil`, one at a time:

| File | Dashboard template | Currently used? |
|---|---|---|
| `magic-link.html` | Magic Link | **Yes** — spectator portal sign-in code |
| `reauthentication.html` | Reauthentication | Not yet |
| `confirm-signup.html` | Confirm signup | Not yet (accounts are auto-confirmed) |
| `invite.html` | Invite user | Not yet |
| `reset-password.html` | Reset Password | Not yet (no forgot-password flow yet) |
| `change-email.html` | Change Email Address | Not yet |

**Do this one first:** `magic-link.html` is the only template that actually
fires today. Paste its contents into Authentication → Email Templates →
Magic Link, and set the subject to something like "Your VSYC-26 sign-in
code." It renders `{{ .Token }}` as a large code, on purpose — no clickable
link, so mail scanners like Outlook/Defender Safe Links can't burn the
one-time token before the recipient opens the email.

While you're in Authentication settings, also set **Email OTP Expiration**
to `300` (5 minutes) under Authentication → Providers → Email, to match the
countdown shown in the spectator portal UI.

The other five templates are here so they look right the moment any of
those flows get wired up later — nothing to do with them now beyond pasting
them in if you want the dashboard previews to look on-brand.
