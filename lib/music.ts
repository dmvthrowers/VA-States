/**
 * Music tracks: one per division per slot per player (vsyc_music). A slot is one track the player
 * uploads for a division: "main" (one routine track for the division), a round ("prelims",
 * "final"...) or an extra such as "battle". contest.config.ts decides which slots a division has
 * (musicSlotsOf in lib/divisions-core.ts). Pure helpers, no imports, so the unit tests can load
 * this file directly.
 */

export type MusicSource = 'player' | 'admin' | 'backfill' | 'fallback';

/** The routine track for a whole division (the only slot before rounds got their own). */
export const MAIN_SLOT = 'main';

export interface MusicTrack {
  division: string;
  slot: string;
  object_name: string;
  filename: string;
  source: MusicSource;
  is_fallback: boolean;
  uploaded_at: string;
}

/** What a division asks players to upload: [{ key: 'prelims', label: 'Prelims' }, ...] */
export interface SlotDef {
  key: string;
  label: string;
}

/** The slots of a division (empty when it has no music). Passed in so this file stays import-free. */
export type SlotsOf = (division: string) => SlotDef[];

/** empty: nothing yet · uploaded: the player's own track · fallback: a lo-fi track was assigned */
export type SlotStatus = 'empty' | 'uploaded' | 'fallback';

export interface MusicSlot {
  division: string;
  /** Division name, e.g. "1A — Single String" */
  name: string;
  slot: string;
  /** "Routine music", "Prelims", "Battle music"... */
  label: string;
  /** True when the division has several tracks, so the label is worth showing */
  labelled: boolean;
  status: SlotStatus;
  track: Pick<MusicTrack, 'filename' | 'uploaded_at' | 'is_fallback'> | null;
}

/** Lo-fi fallback tracks live under this folder of the music bucket. */
export const LOFI_PREFIX = 'lofi/';

export const slotKey = (division: string, slot: string) => `${division}:${slot}`;

/** The divisions a player entered, in the order they entered them, once each. */
function enteredOnce(entered: string[]): string[] {
  return [...new Set(entered)];
}

/** Every (division, slot) a player can upload, in entry order then config order. */
export function playerSlots(entered: string[], slotsOf: SlotsOf): { division: string; slot: string; label: string; labelled: boolean }[] {
  const out: { division: string; slot: string; label: string; labelled: boolean }[] = [];
  for (const division of enteredOnce(entered)) {
    const defs = slotsOf(division);
    for (const d of defs) out.push({ division, slot: d.key, label: d.label, labelled: defs.length > 1 });
  }
  return out;
}

export function slotStatus(track: Pick<MusicTrack, 'is_fallback'> | null | undefined): SlotStatus {
  if (!track) return 'empty';
  return track.is_fallback ? 'fallback' : 'uploaded';
}

/** One slot per track the player can upload, filled from their tracks. */
export function buildSlots(
  entered: string[],
  tracks: MusicTrack[],
  slotsOf: SlotsOf,
  nameOf: (code: string) => string,
): MusicSlot[] {
  const byKey = new Map(tracks.map((t) => [slotKey(t.division, t.slot), t]));
  return playerSlots(entered, slotsOf).map((s) => {
    const t = byKey.get(slotKey(s.division, s.slot)) ?? null;
    return {
      division: s.division,
      name: nameOf(s.division),
      slot: s.slot,
      label: s.label,
      labelled: s.labelled,
      status: slotStatus(t),
      track: t ? { filename: t.filename, uploaded_at: t.uploaded_at, is_fallback: t.is_fallback } : null,
    };
  });
}

/** "1A — Single String" for a one-track division, "1A — Single String · Prelims" otherwise. */
export function slotTitle(s: Pick<MusicSlot, 'name' | 'label' | 'labelled'>): string {
  return s.labelled ? `${s.name} · ${s.label}` : s.name;
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

/** The slots with nothing at all in them, i.e. the ones that need a reminder or a fallback. */
export function emptySlots(slots: MusicSlot[]): MusicSlot[] {
  return slots.filter((s) => s.status === 'empty');
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

export interface EmptyPlayer {
  id: string;
  slots: { division: string; slot: string; label: string; labelled: boolean }[];
}

/** Slots that hold nothing at all (no track of their own and no lo-fi), per player. */
export function emptySlotsByPlayer(
  players: EntrantMusic[],
  tracks: { registration_id: string; division: string; slot: string }[],
  slotsOf: SlotsOf,
): EmptyPlayer[] {
  const filled = new Set(tracks.map((t) => `${t.registration_id}:${slotKey(t.division, t.slot)}`));
  const out: EmptyPlayer[] = [];
  for (const p of players) {
    const slots = playerSlots(p.divisions, slotsOf).filter((s) => !filled.has(`${p.id}:${slotKey(s.division, s.slot)}`));
    if (slots.length) out.push({ id: p.id, slots });
  }
  return out;
}

/**
 * Pick a lo-fi track for every empty slot. Tracks are dealt from a shuffled pool and the pool is
 * reshuffled each time it runs out, so a small pool is spread evenly instead of repeating one track.
 */
export function planFallbacks(
  empty: EmptyPlayer[],
  pool: string[],
  random: () => number = Math.random,
): { registration_id: string; division: string; slot: string; object_name: string }[] {
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
  const out: { registration_id: string; division: string; slot: string; object_name: string }[] = [];
  for (const p of empty) {
    for (const s of p.slots) {
      if (deck.length === 0) deck = shuffled();
      out.push({ registration_id: p.id, division: s.division, slot: s.slot, object_name: deck.pop() as string });
    }
  }
  return out;
}
