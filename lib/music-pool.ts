import type { SupabaseClient } from '@supabase/supabase-js';
import { LOFI_PREFIX, lofiPool } from './music';

export const MUSIC_BUCKET = 'vsyc26-music';

/**
 * Object names of the lo-fi fallback tracks: the audio files in the `lofi/` folder of the private
 * music bucket. Only use tracks you have the right to play at the event.
 */
export async function listLofiPool(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.storage
    .from(MUSIC_BUCKET)
    .list(LOFI_PREFIX.replace(/\/$/, ''), { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
  if (error) throw new Error(`Could not list the lo-fi folder: ${error.message}`);
  return lofiPool((data ?? []).map((o) => o.name));
}
