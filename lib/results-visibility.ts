import type { SupabaseClient } from '@supabase/supabase-js';
import { getEventFlagBoolean } from '@/lib/event-flags';
import { visibilityFrom, type ResultsVisibility } from '@/lib/results-visibility-core';

export { anyPublished, isPublished, releaseKey, visibilityFrom, type ResultsVisibility } from '@/lib/results-visibility-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, 'public', any>;

/**
 * Which results are public: the global results_published flag (admin toggle, env fallback)
 * plus every division:round released from the admin schedule (vsyc_results_releases).
 * Every public results reader uses this. If the releases can't be read, only the global flag
 * counts, so a database hiccup never publishes anything early.
 */
export async function publishedDivisions(supabase: AnyClient): Promise<ResultsVisibility> {
  const all = await getEventFlagBoolean('results_published', process.env.RESULTS_PUBLISHED === 'true');
  if (all) return visibilityFrom(true, []);
  try {
    const { data, error } = await supabase.from('vsyc_results_releases').select('division, round');
    if (error) {
      console.error('[results-visibility] releases query error:', error.message);
      return visibilityFrom(false, []);
    }
    return visibilityFrom(false, (data ?? []) as { division: string; round: number }[]);
  } catch (e) {
    console.error('[results-visibility] releases query failed:', e);
    return visibilityFrom(false, []);
  }
}
