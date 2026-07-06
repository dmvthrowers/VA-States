import { createAdminClient } from '@/lib/supabase/admin';

export type EventFlagKey = 'results_published' | 'online_registration_open';

export async function getEventFlagBoolean(key: EventFlagKey, fallback: boolean): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('vsyc_event_flags')
      .select('value_bool')
      .eq('key', key)
      .maybeSingle();

    if (error || !data || data.value_bool === null || data.value_bool === undefined) {
      return fallback;
    }

    return Boolean(data.value_bool);
  } catch {
    // If the migration has not been applied yet, keep existing env-based behavior.
    return fallback;
  }
}
