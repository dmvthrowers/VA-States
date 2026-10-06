import { createAdminClient } from '@/lib/supabase/admin';
import { contest } from '@/contest.config';
import { effectiveSettings, type SponsorSettings } from '@/lib/sponsor-settings';

/** The defaults from contest.config.ts, as plain mutable settings. */
export function defaultSettings(): SponsorSettings {
  const c = contest.sponsors;
  return {
    enabled: c.enabled,
    intro: c.intro,
    tiers: c.tiers.map((t) => ({ id: t.id, label: t.label, amount: t.amount, ...(t.slots !== undefined ? { slots: t.slots } : {}), ...(t.perks?.length ? { perks: [...t.perks] } : {}) })),
    otherChoices: c.otherChoices.map((o) => ({ ...o })),
    contactMethods: [...c.contactMethods],
    paymentMethods: [...c.paymentMethods],
    heardFrom: [...c.heardFrom],
  };
}

/** Saved settings, else the config defaults. A read error falls back to the defaults so the form stays up. */
export async function loadSponsorSettings(): Promise<{ settings: SponsorSettings; customized: boolean }> {
  const defaults = defaultSettings();
  const { data, error } = await createAdminClient().from('vsyc_sponsor_form').select('settings').maybeSingle();
  if (error) {
    console.error('[sponsor-settings] read error:', error);
    return { settings: defaults, customized: false };
  }
  return { settings: effectiveSettings(defaults, data?.settings ?? null), customized: !!data };
}
