import { z } from 'zod';

const nameSchema = z.string().trim().min(1).max(50);
const emailSchema = z.string().trim().email().toLowerCase();
const phoneSchema = z.string().trim().min(7).max(20).regex(/^[\d\s\-+().]+$/, 'Invalid phone number');
const stateSchema = z.string().trim().length(2).toUpperCase();
const honeypotSchema = z.string().max(0, 'Bot detected').optional();

const socialsSchema = z.object({
  instagram: z.string().trim().max(100).optional().or(z.literal('')),
  tiktok:    z.string().trim().max(100).optional().or(z.literal('')),
  youtube:   z.string().trim().max(100).optional().or(z.literal('')),
  other:     z.string().trim().max(200).optional().or(z.literal('')),
}).partial();

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
  state:                  stateSchema,
  club_affiliation:       z.string().trim().max(100).optional().or(z.literal('')),

  // Minor — required only if age_on_event < 18 (enforced in superRefine)
  parent_name:      z.string().trim().max(100).optional().or(z.literal('')),
  parent_email:     z.string().trim().email().toLowerCase().optional().or(z.literal('')),
  parent_consented: z.boolean().optional(),

  // Divisions
  divisions:  z.array(z.enum(['1A', 'X', 'SBJ'])).min(1, 'Select at least one division'),
  x_substyles: z.array(z.enum(['2A', '3A', '4A', '5A'])).optional(),

  // Comp code
  comp_code: z.string().trim().toUpperCase().max(40).optional().or(z.literal('')),

  // Waivers — all must be true
  liability_waiver_accepted: z.literal(true, { errorMap: () => ({ message: 'Liability waiver is required' }) }),
  photo_video_consent:       z.literal(true, { errorMap: () => ({ message: 'Photo/video consent is required' }) }),
  code_of_conduct_accepted:  z.literal(true, { errorMap: () => ({ message: 'Code of Conduct agreement is required' }) }),

  // Required for competitors
  emergency_contact_name:  z.string().trim().min(1, 'Emergency contact name is required').max(100),
  emergency_contact_phone: phoneSchema,

  // Optional profile + setup
  nickname:      z.string().trim().max(50).optional().or(z.literal('')),
  photo_url:     z.string().trim().url().max(500).optional().or(z.literal('')),
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
  performance_time_pref: z.enum(['no_pref', 'early', 'late', 'conflict']).optional(),
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

  const hasSBJ = data.divisions.includes('SBJ');
  const hasProDivision = data.divisions.includes('1A') || data.divisions.includes('X');
  if (hasSBJ && hasProDivision) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Sport / Beginner / Junior cannot be combined with 1A or X Division', path: ['divisions'] });
  }

  const selectedXSubstyles = data.x_substyles ?? [];
  if (data.divisions.includes('X') && selectedXSubstyles.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Select at least one X Division sub-style (2A, 3A, 4A, or 5A)', path: ['x_substyles'] });
  }
  if (!data.divisions.includes('X') && selectedXSubstyles.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'X Division sub-styles can only be selected when X Division is selected', path: ['x_substyles'] });
  }
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

  photo_url:     z.string().trim().url().max(500).optional().or(z.literal('')),
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
