import { z } from 'zod';
import { SPONSOR_STATUSES } from '@/lib/sponsors';

export const sponsorFields = z.object({
  name: z.string().trim().min(1).max(120),
  tier: z.string().trim().max(60).nullish(),
  status: z.enum(SPONSOR_STATUSES),
  amount_cents: z.number().int().min(0).max(100_000_000),
  in_kind: z.string().trim().max(300).nullish(),
  contact_name: z.string().trim().max(120).nullish(),
  contact_email: z.string().trim().email().max(320).nullish().or(z.literal('')),
  notes: z.string().trim().max(2000).nullish(),
  deliverables: z.array(z.object({ label: z.string(), done: z.boolean().optional() })).max(20).optional(),
  auth_user_id: z.string().uuid().nullish(),
});
