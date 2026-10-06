import { z } from 'zod';
import { competition, contest } from '@/contest.config';
import { US_STATE_CODES, isZip, residencyIssues } from '@/lib/residency';
import { selectionIssues } from './divisions-core';
import { JOIN_CODE_RE, TEAM_NAME_MAX, normalizeJoinCode, teamChoiceIssues, type TeamChoice } from './team-entries';
import { VOLUNTEER_ROLE_KEYS, SHIFT_PREFERENCES, OTHER_ROLE_KEY, isExperienceRequired } from './volunteer-roles';

const nameSchema = z.string().trim().min(1).max(50);
const emailSchema = z.string().trim().email().toLowerCase();
const phoneSchema = z.string().trim().min(7).max(20).regex(/^[\d\s\-+().]+$/, 'Invalid phone number');
const stateSchema = z.string().trim().length(2).toUpperCase();
/** A home state for registration: one of the 50 states or DC. */
const homeStateSchema = stateSchema.refine((v) => US_STATE_CODES.includes(v), { message: 'Choose your state' });
const honeypotSchema = z.string().max(0, 'Bot detected').optional();

const photoUrlSchema = z.string().trim().url().max(500)
  .refine((url) => /^https:\/\//i.test(url), { message: 'Photo URL must start with https://' })
  .optional().or(z.literal(''));

const socialsSchema = z.object({
  instagram: z.string().trim().max(100).optional().or(z.literal('')),
  tiktok:    z.string().trim().max(100).optional().or(z.literal('')),
  youtube:   z.string().trim().max(100).optional().or(z.literal('')),
  other:     z.string().trim().max(200).optional().or(z.literal('')),
}).partial();

export const divisionsSchema = z.array(z.string().trim().max(20)).min(1, 'Select at least one division');
export const divisionStylesSchema = z.record(z.string().max(20), z.array(z.string().max(20)).max(20)).optional().default({});

/** Adds the config's division/style rules (combinations, style counts) as zod issues. */
export function addSelectionIssues(divisions: string[], styles: Record<string, string[]> | undefined, ctx: z.RefinementCtx) {
  for (const issue of selectionIssues(divisions, styles ?? {}, competition)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue.message, path: [issue.path] });
  }
}

/** One team division's choice: `{ create: { name } }` or `{ join: { code } }`, never both. */
const teamChoiceSchema = z.object({
  create: z.object({
    name: z.string().trim().min(1, 'Enter a name for your team').max(TEAM_NAME_MAX, `Team names can be up to ${TEAM_NAME_MAX} characters`),
  }).strict().optional(),
  join: z.object({
    code: z.string().transform(normalizeJoinCode).pipe(z.string().regex(JOIN_CODE_RE, 'Join codes are 6 letters or numbers')),
  }).strict().optional(),
}).strict()
  .refine((v) => Boolean(v.create) !== Boolean(v.join), { message: 'Choose either start a new team or join one with a code' })
  .transform((v): TeamChoice => (v.create ? { create: v.create } : { join: v.join! }));

/** `{ [division]: { create: { name } } | { join: { code } } }` for the selected team divisions (docs/FORMATS.md → Teams). */
export const teamsSchema = z.record(z.string().max(20), teamChoiceSchema).optional().default({});

/** Every selected team division needs a choice; non-team or unselected divisions can't have one. */
export function addTeamIssues(divisions: string[], teams: Record<string, unknown> | undefined, ctx: z.RefinementCtx) {
  for (const issue of teamChoiceIssues(divisions, teams, competition)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue.message, path: ['teams', issue.division] });
  }
}

export const registrationSchema = z.object({
  // Player info
  first_name:             nameSchema,
  last_name:              nameSchema,
  preferred_bracket_name: z.string().trim().max(50).optional().or(z.literal('')),
  age_on_event:           z.number().int().min(1).max(120),
  pronouns:               z.string().trim().max(30).optional().or(z.literal('')),
  email:                  emailSchema,
  phone:                  phoneSchema,
  city:                   z.string().trim().min(1).max(100),
  state:                  homeStateSchema,
  // Home address: asked only of people entering the champion's state (see lib/residency.ts)
  home_address:           z.string().trim().max(200).optional().or(z.literal('')),
  home_zip:               z.string().trim().max(10).optional().or(z.literal('')),
  home_state_confirmed:   z.boolean().optional(),
  club_affiliation:       z.string().trim().max(100).optional().or(z.literal('')),

  // Minor — required only if age_on_event < 18 (enforced in superRefine)
  parent_name:      z.string().trim().max(100).optional().or(z.literal('')),
  parent_email:     z.string().trim().email().toLowerCase().optional().or(z.literal('')),
  parent_consented: z.boolean().optional(),

  // Divisions and styles — allowed values and rules come from contest.config.ts → competition
  divisions:       divisionsSchema,
  division_styles: divisionStylesSchema,
  // Team divisions: start a team or join one with its code
  teams:           teamsSchema,

  // Comp code
  comp_code: z.string().trim().toUpperCase().max(40).optional().or(z.literal('')),

  // Waivers — all must be true
  liability_waiver_accepted: z.literal(true, { errorMap: () => ({ message: 'Liability waiver is required' }) }),
  photo_video_consent:       z.literal(true, { errorMap: () => ({ message: 'Photo/video consent is required' }) }),
  code_of_conduct_accepted:  z.literal(true, { errorMap: () => ({ message: 'Code of Conduct agreement is required' }) }),

  // Required for competitors
  emergency_contact_name:         z.string().trim().min(1, 'Emergency contact name is required').max(100),
  emergency_contact_phone:        phoneSchema,
  emergency_contact_relationship: z.string().trim().min(1, 'Emergency contact relationship is required').max(50),

  // Optional profile + setup
  nickname:      z.string().trim().max(50).optional().or(z.literal('')),
  photo_url:     photoUrlSchema,
  bio:           z.string().trim().max(1000).optional().or(z.literal('')),
  team:          z.string().trim().max(100).optional().or(z.literal('')),
  yoyo:          z.string().trim().max(100).optional().or(z.literal('')),
  string:        z.string().trim().max(100).optional().or(z.literal('')),
  counterweight: z.string().trim().max(100).optional().or(z.literal('')),
  socials:       socialsSchema.optional(),
  is_public:     z.boolean().optional(),

  // Optional organizer metadata
  volunteer_interest:      z.boolean().optional(),
  accessibility_needs:     z.string().trim().max(500).optional().or(z.literal('')),

  // Scheduling — used by organizers to build the run order / draw
  performance_time_pref: z.enum(['no_pref', 'early', 'late', 'conflict']).optional().or(z.literal('')),
  scheduling_notes:      z.string().trim().max(300).optional().or(z.literal('')),

  merch_order:             z.array(z.object({
    type:        z.string(),
    size:        z.string().optional(),
    qty:         z.number().int().min(1).max(10),
    price_cents: z.number().int().min(0),
  })).optional(),

  // Honeypot — must be empty
  _hp: honeypotSchema,
}).superRefine((data, ctx) => {
  if (data.age_on_event < 18) {
    if (!data.parent_name) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Parent/guardian name required for minors', path: ['parent_name'] });
    }
    if (!data.parent_email) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Parent/guardian email required for minors', path: ['parent_email'] });
    }
    if (!data.parent_consented) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Parent/guardian consent required for minors', path: ['parent_consented'] });
    }
  }

  for (const i of residencyIssues(data, contest.stateChampion.state)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: i.message, path: [i.field] });
  }
  if (data.home_zip && !isZip(data.home_zip)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a 5-digit ZIP code', path: ['home_zip'] });
  }

  addSelectionIssues(data.divisions, data.division_styles, ctx);
  addTeamIssues(data.divisions, data.teams, ctx);
});

export type RegistrationInput = z.infer<typeof registrationSchema>;

// ─── Spectator RSVP (free) ─────────────────────────────────────────────────

export const spectatorSchema = z.object({
  first_name: nameSchema,
  last_name:  nameSchema,
  nickname:   z.string().trim().max(50).optional().or(z.literal('')),
  pronouns:   z.string().trim().max(30).optional().or(z.literal('')),
  email:      emailSchema,
  state:      stateSchema,

  photo_url:     photoUrlSchema,
  bio:           z.string().trim().max(1000).optional().or(z.literal('')),
  team:          z.string().trim().max(100).optional().or(z.literal('')),
  club:          z.string().trim().max(100).optional().or(z.literal('')),
  yoyo:          z.string().trim().max(100).optional().or(z.literal('')),
  string:        z.string().trim().max(100).optional().or(z.literal('')),
  counterweight: z.string().trim().max(100).optional().or(z.literal('')),
  socials:       socialsSchema.optional(),

  is_public: z.boolean().optional().default(false),
  volunteer_interest: z.boolean().optional(),

  liability_accepted:       z.literal(true, { errorMap: () => ({ message: 'Please acknowledge you are responsible for yourself at the event' }) }),
  code_of_conduct_accepted: z.literal(true, { errorMap: () => ({ message: 'Code of Conduct agreement is required' }) }),

  _hp: honeypotSchema,
});

export type SpectatorInput = z.infer<typeof spectatorSchema>;

// ─── Volunteer application ──────────────────────────────────────────────────

const roleKeySchema = z.enum(VOLUNTEER_ROLE_KEYS);

export const volunteerSchema = z.object({
  first_name: nameSchema,
  last_name:  nameSchema,
  email:      emailSchema,
  phone:      phoneSchema,
  pronouns:   z.string().trim().max(30).optional().or(z.literal('')),

  is_18_or_older: z.boolean(),

  // Required only if is_18_or_older is false (enforced in superRefine)
  parent_guardian_name:  z.string().trim().max(100).optional().or(z.literal('')),
  parent_guardian_email: z.string().trim().email().toLowerCase().optional().or(z.literal('')),
  parent_guardian_phone: z.string().trim().max(20).optional().or(z.literal('')),

  role_choice_1: roleKeySchema,
  role_choice_2: roleKeySchema.optional().or(z.literal('')),

  shift_preference: z.enum(SHIFT_PREFERENCES).default('flexible'),
  // Mandatory for core roles, judges, and "other" (see superRefine below);
  // optional for the rest.
  experience_notes: z.string().trim().max(500).optional().or(z.literal('')),
  // Required only when role_choice_1 or role_choice_2 is the "other" role.
  other_role_description: z.string().trim().max(300).optional().or(z.literal('')),

  emergency_contact_name:  z.string().trim().max(100).optional().or(z.literal('')),
  emergency_contact_phone: z.string().trim().max(20).optional().or(z.literal('')),
  photo_video_consent:     z.boolean().optional().default(false),

  liability_accepted:       z.literal(true, { errorMap: () => ({ message: 'Please acknowledge you are responsible for yourself at the event' }) }),
  code_of_conduct_accepted: z.literal(true, { errorMap: () => ({ message: 'Code of Conduct agreement is required' }) }),

  _hp: honeypotSchema,
}).superRefine((data, ctx) => {
  if (!data.is_18_or_older) {
    if (!data.parent_guardian_name) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Parent/guardian name is required for volunteers under 18', path: ['parent_guardian_name'] });
    }
    if (!data.parent_guardian_phone) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Parent/guardian phone is required for volunteers under 18', path: ['parent_guardian_phone'] });
    }
  }

  if (data.role_choice_2 && data.role_choice_2 === data.role_choice_1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Second choice must be different from your first choice', path: ['role_choice_2'] });
  }

  const experienceRequired = isExperienceRequired(data.role_choice_1) || isExperienceRequired(data.role_choice_2);
  if (experienceRequired && !data.experience_notes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Relevant experience is required for core roles, judges, and the "Other" option',
      path: ['experience_notes'],
    });
  }

  const choseOther = data.role_choice_1 === OTHER_ROLE_KEY || data.role_choice_2 === OTHER_ROLE_KEY;
  if (choseOther && !data.other_role_description) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Tell us what the act/idea is',
      path: ['other_role_description'],
    });
  }
});

export type VolunteerInput = z.infer<typeof volunteerSchema>;
