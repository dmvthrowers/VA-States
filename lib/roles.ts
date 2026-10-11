/**
 * Roles and what they may do: the pure rules behind a role-based portal (docs/ROLES.md).
 *
 * - A person has ONE account and any number of roles (player, volunteer, judge, DJ ...). Their portal is
 *   the union of what every role they hold allows, so someone who is a player, a volunteer and a judge sees
 *   one pane with all three.
 * - `admin` can do everything. It is computed as "every capability", so a capability added later is
 *   automatically admin's, and no role can hold something admin lacks.
 * - A grant can be limited to one event (when a deployment runs several); no event means every event.
 * - Roles are data (this table), not scattered `role === 'judge'` checks. Add a role or capability here.
 *
 * No imports, so `npm test` runs it under plain Node and the browser can use it for menus. The server must
 * still check capabilities on every route: hiding a menu item is a convenience, not security.
 */

/** Everything a role can be allowed to do. Strings are `area.action`. */
export const CAPABILITIES = [
  // the event itself
  'event.configure', // events, divisions, prices, rounds, prizes, schedule setup
  'staff.manage', // grant and revoke roles, deactivate accounts
  'audit.view',
  'forms.review', // read and handle answers to the public forms (contact, reports)
  // people
  'registrations.view',
  'registrations.edit', // mark paid, change divisions, comp codes, walk-ups
  'players.view_private', // addresses, ages, emergency contacts
  // day of
  'schedule.run', // start/stop blocks, close judging
  'results.publish',
  'runorder.edit',
  'scores.enter',
  'scores.review', // score status, outliers, lock/unlock
  'brackets.run',
  // sound and stream
  'music.play', // DJ queue, play and download tracks
  'music.manage', // upload for players, lo-fi pool, reminders
  'stream.control', // overlays, now-performing, scenes
  'stream.tech', // encoder, cameras, audio levels, health
  'media.upload', // photos and video
  'media.publish',
  'mc.script', // announcer view, run of show, shoutouts
  // money and partners
  'finance.view',
  'finance.edit', // budget, expenses, payouts
  'sponsors.manage',
  'sponsors.view',
  'merch.manage', // inventory, orders, pickup
  'volunteers.manage', // shifts, roles, check-in
  'volunteers.view',
  // the person's own things
  'self.registration', // see and edit my own registration
  'self.music', // upload my own music
  'self.shifts', // see and accept my own volunteer shifts
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export interface RoleDef {
  label: string;
  description: string;
  /** What the role may do. `admin` ignores this list and holds every capability. */
  capabilities: readonly Capability[];
  /** Roles a person holds because of what they've done (a registration), not because someone granted them */
  automatic?: boolean;
}

export const ROLES = {
  admin: {
    label: 'Admin',
    description: 'Full control of everything: every portal, module and setting.',
    capabilities: [],
  },
  player: {
    label: 'Player',
    description: 'A registered competitor: their own registration, music and results.',
    capabilities: ['self.registration', 'self.music'],
    automatic: true,
  },
  volunteer: {
    label: 'Volunteer',
    description: 'Helps run the event: their own shifts and check-in.',
    capabilities: ['self.shifts', 'volunteers.view'],
    automatic: true,
  },
  judge: {
    label: 'Judge',
    description: 'Scores competitors and reviews score status.',
    capabilities: ['scores.enter', 'scores.review', 'runorder.edit', 'brackets.run', 'results.publish', 'schedule.run'],
  },
  dj: {
    label: 'Music / DJ',
    description: 'Plays and manages competitors\' music.',
    capabilities: ['music.play', 'music.manage', 'runorder.edit', 'schedule.run'],
  },
  audio_tech: {
    label: 'Audio tech',
    description: 'Sound system and music playback.',
    capabilities: ['music.play', 'runorder.edit', 'schedule.run'],
  },
  streamer: {
    label: 'Streamer',
    description: 'Runs the livestream: scenes, overlays and what is on air.',
    capabilities: ['stream.control', 'schedule.run'],
  },
  stream_tech: {
    label: 'Stream tech',
    description: 'Cameras, encoder, audio levels and stream health.',
    capabilities: ['stream.tech', 'stream.control'],
  },
  media: {
    label: 'Video & pictures',
    description: 'Photos and video: upload, organize and publish.',
    capabilities: ['media.upload', 'media.publish'],
  },
  mc: {
    label: 'MC',
    description: 'The announcer: run of show, who is up, shoutouts.',
    capabilities: ['mc.script', 'schedule.run'],
  },
  merch: {
    label: 'Merch',
    description: 'Merch inventory, orders and pickup.',
    capabilities: ['merch.manage'],
  },
  form_reader: {
    label: 'Form answers reader',
    description: 'Reads and handles answers to the public forms (contact, conduct reports). Granted by an admin to chosen staff.',
    capabilities: ['forms.review'],
  },
  sponsor: {
    label: 'Sponsor',
    description: 'A sponsor\'s view of their own tier, deliverables and exposure.',
    capabilities: ['sponsors.view'],
  },
  finance: {
    label: 'Finance / budget',
    description: 'Budget, expenses, payouts and payment records.',
    capabilities: ['finance.view', 'finance.edit', 'registrations.view', 'audit.view'],
  },
  organizer: {
    label: 'Organizer',
    description: 'Runs registration, volunteers and sponsors day to day, without settings or role changes.',
    capabilities: [
      'registrations.view', 'registrations.edit', 'players.view_private', 'volunteers.manage', 'volunteers.view',
      'sponsors.manage', 'sponsors.view', 'schedule.run', 'runorder.edit', 'results.publish', 'audit.view',
    ],
  },
} as const satisfies Record<string, RoleDef>;

export type Role = keyof typeof ROLES;
export const ROLE_IDS = Object.keys(ROLES) as Role[];

/** A role held by a person, optionally for one event only (null/undefined = every event). */
export interface RoleGrant {
  role: Role;
  event?: string | null;
}

export const isRole = (v: unknown): v is Role => typeof v === 'string' && Object.hasOwn(ROLES, v);

/** What one role allows. Admin holds every capability. */
export function capabilitiesOfRole(role: Role): ReadonlySet<Capability> {
  return role === 'admin' ? new Set(CAPABILITIES) : new Set(ROLES[role].capabilities);
}

/** The grants that apply to `event` (all-event grants always apply). With no event, every grant applies. */
function applicable(grants: readonly RoleGrant[], event?: string | null): RoleGrant[] {
  if (event === undefined || event === null) return [...grants];
  return grants.filter((g) => !g.event || g.event === event);
}

/** Everything a person may do, from all their roles. */
export function capabilitiesOf(grants: readonly RoleGrant[], event?: string | null): Set<Capability> {
  const out = new Set<Capability>();
  for (const g of applicable(grants, event)) for (const c of capabilitiesOfRole(g.role)) out.add(c);
  return out;
}

export const can = (grants: readonly RoleGrant[], capability: Capability, event?: string | null): boolean =>
  capabilitiesOf(grants, event).has(capability);

export const canAny = (grants: readonly RoleGrant[], capabilities: readonly Capability[], event?: string | null): boolean => {
  const have = capabilitiesOf(grants, event);
  return capabilities.some((c) => have.has(c));
};

export const canAll = (grants: readonly RoleGrant[], capabilities: readonly Capability[], event?: string | null): boolean => {
  const have = capabilitiesOf(grants, event);
  return capabilities.every((c) => have.has(c));
};

export const isAdmin = (grants: readonly RoleGrant[], event?: string | null): boolean =>
  applicable(grants, event).some((g) => g.role === 'admin');

/** The role ids a person holds (for badges and the portal header), each once, in the table's order. */
export function rolesHeld(grants: readonly RoleGrant[], event?: string | null): Role[] {
  const have = new Set(applicable(grants, event).map((g) => g.role));
  return ROLE_IDS.filter((r) => have.has(r));
}

/**
 * Portals: the screens a person sees. Each lists the capabilities it needs (any one shows it) and where
 * it lives. One account's portal is every portal whose capabilities they hold, so a person with several
 * roles gets a single menu. `href`s are the app's routes; the page behind each must still check the
 * capability on the server.
 */
export interface PortalDef {
  id: string;
  label: string;
  href: string;
  /** Shown when the person holds any of these */
  needs: readonly Capability[];
  /** False while the screen behind `href` doesn't exist yet; the menu shows it as "coming soon" instead of a dead link */
  ready: boolean;
}

export const PORTALS: readonly PortalDef[] = [
  { id: 'my', label: 'My registration', href: '/player', needs: ['self.registration'], ready: true },
  { id: 'my-music', label: 'My music', href: '/upload', needs: ['self.music'], ready: true },
  { id: 'my-shifts', label: 'My shifts', href: '/volunteer', needs: ['self.shifts'], ready: true },
  { id: 'judge', label: 'Judging', href: '/judge', needs: ['scores.enter', 'scores.review'], ready: true },
  { id: 'brackets', label: 'Battle brackets', href: '/admin/brackets', needs: ['brackets.run'], ready: true },
  { id: 'day', label: 'Run the day', href: '/admin/schedule', needs: ['schedule.run'], ready: true },
  { id: 'run-order', label: 'Run order', href: '/admin/run-order', needs: ['runorder.edit'], ready: true },
  { id: 'side-events', label: 'Side events', href: '/staff/side-events', needs: ['schedule.run'], ready: true },
  { id: 'dj', label: 'Music / DJ', href: '/dj', needs: ['music.play', 'music.manage'], ready: true },
  { id: 'stream', label: 'Stream', href: '/stream', needs: ['stream.control', 'stream.tech'], ready: true },
  { id: 'media', label: 'Video & pictures', href: '/media', needs: ['media.upload', 'media.publish'], ready: true },
  { id: 'mc', label: 'MC', href: '/mc', needs: ['mc.script'], ready: true },
  { id: 'merch', label: 'Merch', href: '/merch', needs: ['merch.manage'], ready: true },
  { id: 'sponsors', label: 'Sponsors', href: '/sponsors', needs: ['sponsors.manage', 'sponsors.view'], ready: true },
  { id: 'volunteers', label: 'Volunteers', href: '/volunteers', needs: ['volunteers.manage', 'volunteers.view'], ready: true },
  { id: 'finance', label: 'Finance', href: '/finance', needs: ['finance.view', 'finance.edit'], ready: true },
  { id: 'registrations', label: 'Registrations', href: '/admin-dashboard', needs: ['registrations.view', 'registrations.edit'], ready: true },
  { id: 'walk-up', label: 'Walk-up registration', href: '/admin/walk-up', needs: ['registrations.edit'], ready: true },
  { id: 'forms', label: 'Form answers', href: '/forms-review', needs: ['forms.review'], ready: true },
  { id: 'staff', label: 'Staff and roles', href: '/admin/staff', needs: ['staff.manage'], ready: true },
  { id: 'event', label: 'Event setup', href: '/admin/event', needs: ['event.configure'], ready: true },
];

/** The portals this person can open, in menu order. */
export function portalsFor(grants: readonly RoleGrant[], event?: string | null): PortalDef[] {
  const have = capabilitiesOf(grants, event);
  return PORTALS.filter((p) => p.needs.some((c) => have.has(c)));
}

/**
 * The old single `role` column ('judge' | 'dj' | 'audio_tech' | 'admin') as grants, so existing accounts keep
 * working while accounts move to several roles. Unknown values give no grants.
 */
export function grantsFromLegacyRole(role: string | null | undefined): RoleGrant[] {
  return isRole(role) ? [{ role }] : [];
}

/** A row of `vsyc_role_grants`, as read from the database. */
export interface RoleGrantRow {
  role: string;
  event_id?: string | null;
  revoked_at?: string | null;
}

/**
 * Grants from database rows: revoked rows and roles this code doesn't know are dropped, repeats collapse.
 * Anything unrecognised gives no power rather than an error.
 */
export function grantsFromRows(rows: readonly RoleGrantRow[] | null | undefined): RoleGrant[] {
  const seen = new Set<string>();
  const out: RoleGrant[] = [];
  for (const r of rows ?? []) {
    if (r.revoked_at || !isRole(r.role)) continue;
    const event = r.event_id ?? null;
    const key = `${r.role}|${event ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(event ? { role: r.role, event } : { role: r.role });
  }
  return out;
}

/** One row per (account, grant), for checking a change against the people who hold admin. */
export interface AdminCheckRow extends RoleGrantRow {
  auth_user_id: string;
  is_active: boolean;
}

/**
 * True when revoking this grant would leave nobody holding admin for every event. Only active accounts with a
 * live admin grant that isn't limited to one event count. Revoking anything other than such an admin grant
 * never blocks.
 */
export function wouldRemoveLastAdmin(
  rows: readonly AdminCheckRow[],
  revoke: { auth_user_id: string; role: string; event_id?: string | null },
): boolean {
  if (revoke.role !== 'admin' || revoke.event_id) return false;
  const others = new Set<string>();
  for (const r of rows) {
    if (r.role !== 'admin' || r.revoked_at || r.event_id || !r.is_active) continue;
    if (r.auth_user_id !== revoke.auth_user_id) others.add(r.auth_user_id);
  }
  return others.size === 0;
}

/** Roles an admin can hand out by hand: everything except the automatic ones (player, volunteer). */
export const GRANTABLE_ROLES: Role[] = ROLE_IDS.filter((r) => !('automatic' in ROLES[r] && ROLES[r].automatic));

/**
 * For screens that gate on a list of role names: true when the account's legacy `role` or any of its
 * all-event grants is in `roles`. (The server still decides with `can()`; this only picks which page to show.)
 */
export function holdsAnyRole(
  me: { role?: string | null; grants?: readonly { role: string; event?: string | null }[] | null },
  roles: readonly string[],
): boolean {
  if (me.role && roles.includes(me.role)) return true;
  return (me.grants ?? []).some((g) => !g.event && roles.includes(g.role));
}

/** Problems with the role table itself (empty = fine). Run by the tests. */
export function roleIssues(): string[] {
  const out: string[] = [];
  const known = new Set<string>(CAPABILITIES);
  for (const id of ROLE_IDS) {
    for (const c of ROLES[id].capabilities) if (!known.has(c)) out.push(`${id}: unknown capability ${c}`);
  }
  if (ROLES.admin.capabilities.length !== 0) out.push('admin lists no capabilities: it holds all of them');
  for (const p of PORTALS) for (const c of p.needs) if (!known.has(c)) out.push(`portal ${p.id}: unknown capability ${c}`);
  const reachable = new Set<Capability>();
  for (const p of PORTALS) for (const c of p.needs) reachable.add(c);
  // Every non-self capability that some role holds should be reachable from a portal, or the role has no screen for it.
  for (const id of ROLE_IDS) {
    for (const c of ROLES[id].capabilities) {
      if (c.startsWith('self.')) continue;
      const hasScreen = PORTALS.some((p) => p.needs.includes(c));
      if (!hasScreen && !['players.view_private', 'audit.view', 'runorder.edit', 'results.publish', 'scores.review', 'brackets.run', 'media.publish', 'sponsors.view'].includes(c)) out.push(`${id}: ${c} has no portal`);
    }
  }
  return out;
}
