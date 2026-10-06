import { z } from 'zod';

/**
 * Editable sponsor form settings. contest.config.ts holds the defaults; a saved copy (table
 * vsyc_sponsor_form) overrides them. Pure, so it is tested without a database.
 */
export interface TierDef { id: string; label: string; amount: string; slots?: number; perks?: string[] }
export interface SponsorSettings {
  enabled: boolean;
  intro: string;
  tiers: TierDef[];
  otherChoices: { id: string; label: string }[];
  contactMethods: string[];
  paymentMethods: string[];
  heardFrom: string[];
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
const text = (max: number) => z.string().trim().min(1).max(max);
const list = z.array(text(60)).max(12);

/** Tiers may arrive without an id (a new one); the id is made from the name. */
const tierIn = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,40}$/).optional(),
  label: text(60),
  amount: text(40),
  slots: z.number().int().min(1).max(999).optional(),
  perks: z.array(text(120)).max(8).optional(),
}).strict();

export const settingsSchema = z.object({
  enabled: z.boolean(),
  intro: z.string().trim().max(600),
  tiers: z.array(tierIn).min(1, 'Keep at least one tier.').max(12),
  otherChoices: z.array(z.object({ id: z.string().regex(/^[a-z0-9_]{1,40}$/).optional(), label: text(60) }).strict()).max(6),
  contactMethods: list,
  paymentMethods: list,
  heardFrom: list,
}).strict();

function withIds<T extends { id?: string; label: string }>(items: T[], reserved: string[] = []): (T & { id: string })[] {
  const used = new Set(reserved);
  return items.map((it) => {
    let id = it.id ?? (slug(it.label) || 'item');
    if (used.has(id)) { let n = 2; while (used.has(`${id}_${n}`)) n++; id = `${id}_${n}`; }
    used.add(id);
    return { ...it, id };
  });
}

/** Validated input -> settings with every tier and choice given a unique, stable id. Throws on invalid input. */
export function normalizeSettings(input: unknown): SponsorSettings {
  const s = settingsSchema.parse(input);
  const ids = s.tiers.map((t) => t.id).filter((x): x is string => !!x);
  if (new Set(ids).size !== ids.length) throw new Error('Two tiers share an id.');
  const tiers = withIds(s.tiers).map((t) => ({ id: t.id, label: t.label, amount: t.amount, ...(t.slots !== undefined ? { slots: t.slots } : {}), ...(t.perks?.length ? { perks: t.perks } : {}) }));
  const otherChoices = withIds(s.otherChoices, tiers.map((t) => t.id)).map((c) => ({ id: c.id, label: c.label }));
  const names = [...tiers.map((t) => t.label), ...otherChoices.map((c) => c.label)].map((n) => n.toLowerCase());
  if (new Set(names).size !== names.length) throw new Error('Two choices have the same name.');
  return { enabled: s.enabled, intro: s.intro, tiers, otherChoices, contactMethods: s.contactMethods, paymentMethods: s.paymentMethods, heardFrom: s.heardFrom };
}

/** The saved settings if they are valid, else the config defaults (a bad row never takes the form down). */
export function effectiveSettings(defaults: SponsorSettings, stored: unknown): SponsorSettings {
  if (stored == null) return defaults;
  try { return normalizeSettings(stored); } catch { return defaults; }
}

/** Tiers whose name changed (same id, new label), so sponsors already placed at the old name can follow. */
export function renamedTiers(prev: readonly TierDef[], next: readonly TierDef[]): { from: string; to: string }[] {
  return next.flatMap((n) => {
    const p = prev.find((x) => x.id === n.id);
    return p && p.label !== n.label ? [{ from: p.label, to: n.label }] : [];
  });
}
