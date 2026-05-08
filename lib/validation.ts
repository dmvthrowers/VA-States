import { z } from 'zod';

const nameSchema = z.string().trim().min(1).max(50);
const emailSchema = z.string().trim().email().toLowerCase();
const phoneSchema = z.string().trim().min(7).max(20).regex(/^[\d\s\-+().]+$/, 'Invalid phone number');
const stateSchema = z.string().trim().length(2).toUpperCase();
const honeypotSchema = z.string().max(0, 'Bot detected').optional();

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
  x_substyle: z.enum(['2A', '3A', '4A', '5A']).optional(),

  // Comp code
  comp_code: z.string().trim().toUpperCase().max(40).optional().or(z.literal('')),

  // Waivers — all must be true
  liability_waiver_accepted: z.literal(true, { errorMap: () => ({ message: 'Liability waiver is required' }) }),
  photo_video_consent:       z.literal(true, { errorMap: () => ({ message: 'Photo/video consent is required' }) }),
  code_of_conduct_accepted:  z.literal(true, { errorMap: () => ({ message: 'Code of Conduct agreement is required' }) }),

  // Optional
  emergency_contact_name:  z.string().trim().max(100).optional().or(z.literal('')),
  emergency_contact_phone: z.string().trim().max(20).optional().or(z.literal('')),
  volunteer_interest:      z.boolean().optional(),
  accessibility_needs:     z.string().trim().max(500).optional().or(z.literal('')),
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
  if (data.divisions.includes('X') && !data.x_substyle) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Select a sub-style for X Division (2A, 3A, 4A, or 5A)', path: ['x_substyle'] });
  }
});

export type RegistrationInput = z.infer<typeof registrationSchema>;
