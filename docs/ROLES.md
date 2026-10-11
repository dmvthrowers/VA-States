# Roles and the portal

One person, one account, one pane. Someone who is a player, a volunteer and a judge signs in once and sees
everything they're allowed to use. An **admin** can do everything; every other role is a slice of that, so
an organizer can hand out exactly the access a helper needs.

`lib/roles.ts` is the single source of truth (pure and tested). This page explains it and the path from
today's single-role staff accounts to the full model.

## The roles

| Role | Can do (summary) |
| --- | --- |
| **Admin** | Everything: every portal, module and setting, including roles and event setup |
| **Organizer** | Registration, volunteers, sponsors and the day's schedule, without settings or role changes |
| **Finance / budget** | Budget, expenses, payouts, payment records, registrations (read) |
| **Sponsor** | Their own tier, deliverables and exposure |
| **Judge** | Enter and review scores, run battles, publish results |
| **Music / DJ** | Play and manage players' music, the run order |
| **Audio tech** | Sound system and music playback |
| **Streamer** | Run the livestream: scenes, overlays, what's on air |
| **Stream tech** | Cameras, encoder, audio levels, stream health |
| **Video & pictures** | Upload, organize and publish photos and video |
| **MC** | The announcer view: run of show, who's up, shoutouts |
| **Merch** | Inventory, orders, pickup |
| **Form answers reader** | Reads and handles answers to the public forms (contact, conduct reports) at `/forms-review`. Nothing else |
| **Volunteer** | Their own shifts and check-in (granted automatically when they volunteer) |
| **Player** | Their own registration and music (granted automatically when they register) |

`forms.review` (read and handle answers to the public forms at `/forms-review`) is held by **Admin** and by anyone an admin grants the
**Form answers reader** role. That is the owner's rule (2026-10-10): admins, plus staff an admin picks. Grant it per person on
`/admin/staff`, for one event or all of them. The role holds no other capability, so a conduct team member sees the answers and nothing
else.

Roles are data in `ROLES`; a capability is a string like `scores.enter` in `CAPABILITIES`. Adding a role is
adding a row. **Admin is computed as "every capability"**, so a capability added tomorrow is admin's the day
it exists, and a test fails if any other role is as powerful.

## How one account holds several roles

- A person's **grants** are a list of `{ role, event? }`. Their permissions are the union of every grant.
- `portalsFor(grants)` lists the screens they can open (judging, run the day, DJ, finance ...). Each screen
  appears once however many roles lead to it. That list is the single menu.
- A grant can be limited to one **event** (when a deployment runs several, see `HUB_ROADMAP.md`); no event
  means every event. Admin for one event isn't admin of another.
- `player` and `volunteer` are **automatic**: they follow from a registration or a volunteer sign-up, so
  nobody has to grant them, and they never carry staff powers.

## Rules the code must keep

1. **The server decides.** Every route checks `can(grants, capability, event)`. A hidden menu item is a
   convenience, never security.
2. **Least privilege.** A role gets only the capabilities its job needs. Money (`finance.*`), private player
   data (`players.view_private`) and role changes (`staff.manage`) are never in a general-purpose role.
3. **Granting is audited** (who, what, for which event, when) and can be revoked. The last admin can't be
   removed or demoted.
4. **Admin is not a shortcut around checks**: it passes them because it holds every capability.
5. **Staff contact and private data stay private**: the public site shows only the public staff profile fields.

## From today to here

Today an account has one role (`vsyc_staff_accounts.role`: judge, dj, audio_tech or admin) and routes check
`identity.role`. The move is in small, separately shippable steps, each safe on its own:

1. **Core (done):** `lib/roles.ts`, its tests, this page.
2. **Grants table (done, migration 0044; VA-States 0063)** (additive migration): `vsyc_role_grants (auth_user_id, role, event_id, granted_by, created_at,
   revoked_at)`, service-role only. Backfill one grant per existing staff account from its `role`.
3. **Identity returns grants (done):** `getStaffIdentityFromToken` also returns `grants` (from the table, falling back to
   `grantsFromLegacyRole`) and keeps `.role` for old callers. Players and volunteers get their automatic grants
   from their registration and volunteer rows.
4. **Routes use `can()` (done):** every staff API route now asks for a capability (`requireCapabilityRequest`, or `can()` inline); the only `requireAdminRequest` left is the cron-or-admin helper. A parity test per batch pins that the four legacy roles get the same answers as before. Screens that gate on role names use `holdsAnyRole`, which also honors granted roles. Earlier note (first batch): scores, brackets, ladder, DJ music, run order, budget, volunteers, comp codes, spectators, contestants, event flags and the ops dashboard now check capabilities; `requireAdminRequest` uses `isAdmin`. A test pins that today's four legacy roles get the same answers as before. Original note: replace `['admin','dj','audio_tech'].includes(identity.role)` and the like with
   capability checks, route by route, with a test for each. `requireAdminRequest` becomes `requireCapability(...)`.
5. **The portal (done at `/staff`):** `/staff` is now sign-in plus one menu from `portalsFor`, fed by `/api/staff/me` (`grants`, `portals`). Screens that don't exist yet are listed as "coming soon" (`ready: false` in `PORTALS`); flip the flag when a module ships. Players and spectators keep their own sign-in. Original note: a `/portal` page (and menu) built from `portalsFor`: one sign-in, one pane.
6. **New modules (sponsors, stream, media, MC and merch done; migrations 0046 and 0047):** `/sponsors` + `/api/admin/sponsors`: pipeline from prospect to paid, amounts, in-kind, deliverables checklist; `sponsors.manage` edits everything, a sponsor's own login (`sponsors.view`, linked by `auth_user_id`) sees only their record read-only. Migration 0046 also lets a staff account hold any role (the old four-role check on `vsyc_staff_accounts.role` is now just a shape check). One run-sheet screen each at `/stream`, `/media`, `/mc`, `/merch` (`/api/staff/modules/[module]`, table `vsyc_module_items`): titled items with a status, plus a stock count for merch and a files link for media. Access is the module's own capabilities (`lib/modules.ts`, pinned to the portal menu by a test); a module's role can't touch another module's rows. These are deliberately simple lists; richer tools (stream scenes, a real merch inventory) can replace a list without changing the roles. Original list: each its own PR behind its capability: stream, media (video and pictures), MC, merch, sponsors,
   finance/budget. Many already exist in some form (budget, volunteers, sponsors in the admin dashboard) and just
   need a home and a capability.
7. **Staff and roles screen (started, `/admin/staff`):** list staff, add and remove roles (`/api/admin/roles`, needs `staff.manage`, so admin only). Revoking keeps history (`revoked_at`, `revoked_by`) and the last admin can't be removed. An account that has never had a grant row still runs on its legacy role; once it has any row the table alone decides, so revoking a last role doesn't fall back to the old column. New staff accounts get their first grant. Still to do: invite by email, per-event grants in the UI.
8. **Contract (left for last, on purpose):** every route and screen now reads grants, so the old `vsyc_staff_accounts.role` column is only a fallback for an account that has never had a grant row (none after the 0044 backfill) and the value `/api/staff/me` still reports as `role`. Drop it, and the fallback in `getStaffIdentityFromToken`, in a separate migration only after every deployment has applied 0044 and 0045; until then it is harmless and keeps old deployments working.

## Free tiers

None of this needs a new service: grants are one small table in the existing database, auth is the existing
Supabase Auth, and the portal is pages in the existing app. See `HUB_ROADMAP.md` for how the free tiers shape
the rest of the hub.
