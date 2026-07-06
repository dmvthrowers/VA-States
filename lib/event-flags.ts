import { createAdminClient } from '@/lib/supabase/admin';

export type EventFlagKey = 'results_published' | 'online_registration_open';

const flagCache = new Map<EventFlagKey, { value: boolean; expiresAt: number }>();
const FLAG_CACHE_TTL_MS = Number(process.env.EVENT_FLAGS_CACHE_TTL_MS ?? '30000');

export function clearEventFlagCache(keys?: EventFlagKey[]) {
  if (!keys || keys.length === 0) {
    flagCache.clear();
    return;
  }
  for (const key of keys) flagCache.delete(key);
}

export async function getEventFlagBoolean(key: EventFlagKey, fallback: boolean): Promise<boolean> {
  const cached = flagCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('vsyc_event_flags')
      .select('value_bool')
      .eq('key', key)
      .maybeSingle();

    if (error || !data || data.value_bool === null || data.value_bool === undefined) {
      flagCache.set(key, { value: fallback, expiresAt: Date.now() + FLAG_CACHE_TTL_MS });
      return fallback;
    }

    const value = Boolean(data.value_bool);
    flagCache.set(key, { value, expiresAt: Date.now() + FLAG_CACHE_TTL_MS });
    return value;
  } catch {
    // If the migration has not been applied yet, keep existing env-based behavior.
    flagCache.set(key, { value: fallback, expiresAt: Date.now() + FLAG_CACHE_TTL_MS });
    return fallback;
  }
}
