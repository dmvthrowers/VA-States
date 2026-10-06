import { createAdminClient } from '@/lib/supabase/admin';
import { tierAvailability, type TierAvailability } from '@/lib/sponsor-inquiry';
import type { TierDef } from '@/lib/sponsor-settings';

/**
 * Tiers with how many slots are left, for the public form. Only counts leave the server: no sponsor
 * names, amounts or contact details. If the database can't be read the tiers still show, with slots unknown
 * (treated as open), so a hiccup never blocks someone from asking.
 */
export async function loadTierAvailability(tiers: readonly TierDef[]): Promise<TierAvailability[]> {
  const open = (t: TierDef): TierAvailability => ({ id: t.id, label: t.label, amount: t.amount, perks: t.perks, full: false });
  if (!tiers.some((t) => t.slots !== undefined)) return tierAvailability(tiers, []);
  const { data, error } = await createAdminClient().from('vsyc_sponsors').select('tier, status');
  if (error) {
    console.error('[sponsor-availability] read error:', error);
    return tiers.map(open);
  }
  return tierAvailability(tiers, data ?? []);
}
