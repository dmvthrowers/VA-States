/**
 * VSYC-26 volunteer role catalog — single source of truth shared by:
 *  - the volunteer application form (app/volunteer/page.tsx)
 *  - validation (lib/validation.ts)
 *  - the public availability page/API (app/volunteer/roles, /api/volunteer-roles)
 *  - the admin Volunteers tab (components/VolunteerManager.tsx)
 *
 * Keep this list in sync with the seed rows in
 * supabase/migrations/*_0018_volunteers.sql — role_key values must match exactly.
 */

export type VolunteerRoleCategory = 'core' | 'judge' | 'non_core';

export interface VolunteerRoleDef {
  /** Stable key, also the DB primary key / FK target. Never change once live. */
  key: string;
  label: string;
  category: VolunteerRoleCategory;
  description: string;
  /** Per-role cap. Null for judge roles, which share a group cap instead. */
  maxCapacity: number | null;
  /** Roles sharing this key share a combined capacity (see groupMaxCapacity). */
  groupKey: string | null;
  groupMaxCapacity: number | null;
  /** Flag the single highest-priority non-core role on the public page. */
  isPriority: boolean;
  sortOrder: number;
}

export const VOLUNTEER_ROLES: VolunteerRoleDef[] = [
  // --- Core roles: one person each, may carry a small honorarium, more scrutiny ---
  {
    key: 'dj_audio_tech',
    label: 'DJ / Audio Technician',
    category: 'core',
    description: 'Runs the PA system and plays competitor music tracks live. Needs sound experience.',
    maxCapacity: 1,
    groupKey: null,
    groupMaxCapacity: null,
    isPriority: false,
    sortOrder: 100,
  },
  {
    key: 'mc_host',
    label: 'MC / Host',
    category: 'core',
    description: 'Announces competitors, hypes the crowd, and hosts awards. Comfortable on a mic.',
    maxCapacity: 1,
    groupKey: null,
    groupMaxCapacity: null,
    isPriority: false,
    sortOrder: 101,
  },
  {
    key: 'streaming',
    label: 'Streaming',
    category: 'core',
    description: 'Operates the livestream camera and platform for remote viewers.',
    maxCapacity: 1,
    groupKey: null,
    groupMaxCapacity: null,
    isPriority: false,
    sortOrder: 102,
  },

  // --- Judges: three sub-roles sharing one pool, cap 9 total ---
  {
    key: 'sport_division_judge',
    label: 'Sport Division Judge',
    category: 'judge',
    description: 'Scores freestyles for the Sport division. Goal: 3–4 judges per panel plus a senior judge.',
    maxCapacity: null,
    groupKey: 'judge_pool',
    groupMaxCapacity: 9,
    isPriority: false,
    sortOrder: 200,
  },
  {
    key: '1a_pro_judge',
    label: '1A Pro Division Judge',
    category: 'judge',
    description: 'Scores freestyles for the 1A Pro division. Goal: 3–4 judges per panel plus a senior judge.',
    maxCapacity: null,
    groupKey: 'judge_pool',
    groupMaxCapacity: 9,
    isPriority: false,
    sortOrder: 201,
  },
  {
    key: 'x_division_judge',
    label: 'X Division Judge',
    category: 'judge',
    description: 'Scores freestyles for the X division. Goal: 3–4 judges per panel plus a senior judge.',
    maxCapacity: null,
    groupKey: 'judge_pool',
    groupMaxCapacity: 9,
    isPriority: false,
    sortOrder: 202,
  },

  // --- Non-core roles: up to 4 people each, volunteer only ---
  {
    key: 'registration_booth',
    label: 'Registration Booth Attendant',
    category: 'non_core',
    description: 'Highest-priority support role. Checks in competitors and spectators, handles day-of sign-ups.',
    maxCapacity: 4,
    groupKey: null,
    groupMaxCapacity: null,
    isPriority: true,
    sortOrder: 300,
  },
  {
    key: 'event_setup_am',
    label: 'Event Setup (AM)',
    category: 'non_core',
    description: 'Morning load-in and venue setup before doors open.',
    maxCapacity: 4,
    groupKey: null,
    groupMaxCapacity: null,
    isPriority: false,
    sortOrder: 301,
  },
  {
    key: 'event_breakdown_pm',
    label: 'Event Breakdown (PM)',
    category: 'non_core',
    description: 'Afternoon/evening load-out and venue teardown.',
    maxCapacity: 4,
    groupKey: null,
    groupMaxCapacity: null,
    isPriority: false,
    sortOrder: 302,
  },
  {
    key: 'stage_attendant',
    label: 'Stage Attendant',
    category: 'non_core',
    description: 'Supports competitors at the stage — mats, props, and flow between freestyles.',
    maxCapacity: 4,
    groupKey: null,
    groupMaxCapacity: null,
    isPriority: false,
    sortOrder: 303,
  },
  {
    key: 'workshop_attendant',
    label: 'Workshop Attendant',
    category: 'non_core',
    description: 'Helps run workshop stations and assists attendees learning tricks.',
    maxCapacity: 4,
    groupKey: null,
    groupMaxCapacity: null,
    isPriority: false,
    sortOrder: 304,
  },
  {
    key: 'club_table_attendant',
    label: 'Club Table Attendant',
    category: 'non_core',
    description: 'Staffs the DMV Throwers info/merch table.',
    maxCapacity: 4,
    groupKey: null,
    groupMaxCapacity: null,
    isPriority: false,
    sortOrder: 305,
  },
  {
    key: 'videography',
    label: 'Videography',
    category: 'non_core',
    description: 'Records freestyles and general event coverage footage.',
    maxCapacity: 4,
    groupKey: null,
    groupMaxCapacity: null,
    isPriority: false,
    sortOrder: 306,
  },
  {
    key: 'photography',
    label: 'Photography',
    category: 'non_core',
    description: 'Photographs freestyles, awards, and crowd/vendor coverage.',
    maxCapacity: 4,
    groupKey: null,
    groupMaxCapacity: null,
    isPriority: false,
    sortOrder: 307,
  },
  {
    key: 'parent_chaperone',
    label: 'Parent Chaperone',
    category: 'non_core',
    description: 'Supports supervision of minor competitors and attendees throughout the day.',
    maxCapacity: 4,
    groupKey: null,
    groupMaxCapacity: null,
    isPriority: false,
    sortOrder: 308,
  },
];

export const VOLUNTEER_ROLE_KEYS = VOLUNTEER_ROLES.map((r) => r.key) as [string, ...string[]];

export function getVolunteerRole(key: string): VolunteerRoleDef | undefined {
  return VOLUNTEER_ROLES.find((r) => r.key === key);
}

export const SHIFT_PREFERENCES = ['am', 'pm', 'full_day', 'flexible'] as const;
export type ShiftPreference = typeof SHIFT_PREFERENCES[number];

export const SHIFT_PREFERENCE_LABELS: Record<ShiftPreference, string> = {
  am: 'Morning (setup / early)',
  pm: 'Afternoon–evening (contest / breakdown)',
  full_day: 'Full day',
  flexible: 'Flexible — whatever\'s needed',
};

export const VOLUNTEER_STATUSES = ['pending', 'confirmed', 'waitlisted', 'declined', 'withdrawn'] as const;
export type VolunteerStatus = typeof VOLUNTEER_STATUSES[number];
