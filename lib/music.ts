/**
 * Music tracks: one per division per player (vsyc_music). Pure helpers, no imports, so the
 * unit tests can load this file directly.
 */

export type MusicSource = 'player' | 'admin' | 'backfill' | 'fallback';

export interface MusicTrack {
  division: string;
  object_name: string;
  filename: string;
  source: MusicSource;
  is_fallback: boolean;
  uploaded_at: string;
}

/** empty: nothing yet · uploaded: the player's own track · fallback: a lo-fi track was assigned */
export type SlotStatus = 'empty' | 'uploaded' | 'fallback';

export interface MusicSlot {
  division: string;
  name: string;
  status: SlotStatus;
  track: Pick<MusicTrack, 'filename' | 'uploaded_at' | 'is_fallback'> | null;
}

/** Lo-fi fallback tracks live under this folder of the music bucket. */
export const LOFI_PREFIX = 'lofi/';

/** The divisions a player entered that perform to music, in the order they entered them. */
export function musicDivisions(entered: string[], hasMusic: (code: string) => boolean): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const code of entered) {
    if (seen.has(code) || !hasMusic(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

export function slotStatus(track: Pick<MusicTrack, 'is_fallback'> | null | undefined): SlotStatus {
  if (!track) return 'empty';
  return track.is_fallback ? 'fallback' : 'uploaded';
}

/** One slot per music division, filled from the player's tracks. */
export function buildSlots(
  entered: string[],
  tracks: MusicTrack[],
  hasMusic: (code: string) => boolean,
  nameOf: (code: string) => string,
): MusicSlot[] {
  const byDivision = new Map(tracks.map((t) => [t.division, t]));
  return musicDivisions(entered, hasMusic).map((division) => {
    const t = byDivision.get(division) ?? null;
    return {
      division,
      name: nameOf(division),
      status: slotStatus(t),
      track: t ? { filename: t.filename, uploaded_at: t.uploaded_at, is_fallback: t.is_fallback } : null,
    };
  });
}

/** Replacing a player's own track needs an explicit yes. A lo-fi fallback can be replaced freely. */
export function needsReplaceConfirm(existing: Pick<MusicTrack, 'is_fallback'> | null | undefined): boolean {
  return !!existing && !existing.is_fallback;
}

/**
 * After a replace, the old file stays in storage when its name differs (say mp3 → wav). Returns
 * the object to delete, or null: never a lo-fi pool file, and never one another row still uses.
 */
export function staleObjectToRemove(
  previousObject: string | null | undefined,
  nextObject: string,
  stillUsedBy: number,
): string | null {
  if (!previousObject || previousObject === nextObject) return null;
  if (previousObject.startsWith(LOFI_PREFIX)) return null;
  if (stillUsedBy > 0) return null;
  return previousObject;
}

/** Slots with nothing at all in them, i.e. the ones that need a reminder or a fallback. */
export function emptyDivisions(slots: MusicSlot[]): string[] {
  return slots.filter((s) => s.status === 'empty').map((s) => s.division);
}

/** "1A", "1A and X", "1A, X and SBJ" */
export function joinDivisions(codes: string[]): string {
  if (codes.length <= 1) return codes.join('');
  return `${codes.slice(0, -1).join(', ')} and ${codes[codes.length - 1]}`;
}

/** Audio files we accept in the lo-fi pool (same as player uploads). */
const POOL_EXT = /\.(mp3|wav|m4a)$/i;

/** Object names for the lo-fi pool, given the file names listed under the `lofi/` folder. */
export function lofiPool(listedNames: string[]): string[] {
  return listedNames.filter((n) => POOL_EXT.test(n) && !n.startsWith('.')).map((n) => `${LOFI_PREFIX}${n}`);
}

/** "lofi/rain_drops-01.mp3" → "LO-FI rain drops 01": what staff see as the track's name. */
export function lofiDisplayName(objectName: string): string {
  const base = objectName.replace(/^.*\//, '').replace(POOL_EXT, '').replace(/[_-]+/g, ' ').trim();
  return `LO-FI ${base}`.trim();
}

export interface EntrantMusic {
  id: string;
  divisions: string[];
}

/** Music slots that hold nothing at all (no track of their own and no lo-fi), per player. */
export function emptySlotsByPlayer(
  players: EntrantMusic[],
  tracks: { registration_id: string; division: string }[],
  hasMusic: (code: string) => boolean,
): { id: string; divisions: string[] }[] {
  const filled = new Set(tracks.map((t) => `${t.registration_id}:${t.division}`));
  const out: { id: string; divisions: string[] }[] = [];
  for (const p of players) {
    const empty = musicDivisions(p.divisions, hasMusic).filter((d) => !filled.has(`${p.id}:${d}`));
    if (empty.length) out.push({ id: p.id, divisions: empty });
  }
  return out;
}

/**
 * Pick a lo-fi track for every empty slot. Tracks are dealt from a shuffled pool and the pool is
 * reshuffled each time it runs out, so a small pool is spread evenly instead of repeating one track.
 */
export function planFallbacks(
  empty: { id: string; divisions: string[] }[],
  pool: string[],
  random: () => number = Math.random,
): { registration_id: string; division: string; object_name: string }[] {
  if (pool.length === 0) return [];
  const shuffled = () => {
    const a = [...pool];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  let deck: string[] = [];
  const out: { registration_id: string; division: string; object_name: string }[] = [];
  for (const p of empty) {
    for (const division of p.divisions) {
      if (deck.length === 0) deck = shuffled();
      out.push({ registration_id: p.id, division, object_name: deck.pop() as string });
    }
  }
  return out;
}
