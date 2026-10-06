import { divisionByCode } from '@/contest.config';
import { hasMusic, musicSlotsOf } from './divisions-core';
import type { SlotDef } from './music';

/** The music tracks a division asks for (see musicSlotsOf), looked up by division code. */
export const slotsOf = (code: string): SlotDef[] => musicSlotsOf(divisionByCode(code));

export const divisionHasMusic = (code: string): boolean => hasMusic(divisionByCode(code));

export const divisionName = (code: string): string => divisionByCode(code)?.name ?? code;

/**
 * Which slot a request means: the one it names, or the division's only slot when it has just one
 * (so older clients that send no slot keep working). null when it's missing or not one of the
 * division's slots.
 */
export function resolveSlot(division: string, slot: string | null | undefined): string | null {
  const defs = slotsOf(division);
  if (slot) return defs.some((d) => d.key === slot) ? slot : null;
  return defs.length === 1 ? defs[0].key : null;
}

export const slotLabel = (division: string, slot: string): string =>
  slotsOf(division).find((d) => d.key === slot)?.label ?? slot;
