/**
 * How many prizes a division gives, which can change with how many entered (site issues #82 and the
 * prize plan). Pure, so it's tested without a database; the numbers come from contest.config.ts.
 *
 * A division's podium size is the contest default (`contest.prizes.places`) unless the division has
 * its own `prizes.tiers`; the first tier whose `upTo` is at least the entrant count wins. The
 * home-state champion's prize is one more per division, unless the division turns it off.
 */
export interface PrizeTier { upTo?: number; places: number }
export interface DivisionPrizes { tiers?: PrizeTier[]; champion?: boolean }
export interface PrizeDivision { code: string; name: string; prizes?: DivisionPrizes; scoring: { format: string } }

/** Podium places that win a prize in a division with `entrants` entrants. */
export function placesFor(prizes: DivisionPrizes | undefined, entrants: number, defaultPlaces: number): number {
  const tiers = prizes?.tiers;
  if (!tiers?.length) return defaultPlaces;
  const tier = tiers.find((t) => t.upTo === undefined || entrants <= t.upTo) ?? tiers[tiers.length - 1];
  return tier.places;
}

/** Does this division give a home-state champion prize? Needs a champion state and no opt-out. */
export const championPrize = (prizes: DivisionPrizes | undefined, championState: string): boolean =>
  championState.trim() !== '' && prizes?.champion !== false;

export interface PrizeRow { division: string; name: string; entrants: number; places: number; champion: boolean; prizes: number }

export interface PrizePlan { rows: PrizeRow[]; podium: number; champions: number; total: number }

/**
 * The prize plan for these entrant counts: per division the podium places and champion prize, and the
 * totals. Showcase divisions (not judged) have no prizes. The champion prize is counted as one per
 * division that has it; a division with no eligible finisher won't award it, so the total is a maximum.
 */
export function prizePlan(
  divisions: PrizeDivision[],
  entrants: Record<string, number>,
  defaults: { places: number; championState: string },
): PrizePlan {
  const rows = divisions
    .filter((d) => d.scoring.format !== 'showcase')
    .map((d) => {
      const n = entrants[d.code] ?? 0;
      const places = placesFor(d.prizes, n, defaults.places);
      const champion = championPrize(d.prizes, defaults.championState);
      return { division: d.code, name: d.name, entrants: n, places, champion, prizes: places + (champion ? 1 : 0) };
    });
  const podium = rows.reduce((a, r) => a + r.places, 0);
  const champions = rows.filter((r) => r.champion).length;
  return { rows, podium, champions, total: podium + champions };
}

/** The rule set winnersFrom uses: podium size by division and entrants, and whether a division has the champion prize. */
export function prizeRules(divisions: PrizeDivision[], defaults: { places: number; championState: string }) {
  const byCode = new Map(divisions.map((d) => [d.code, d]));
  return {
    places: (division: string, entrants: number) => placesFor(byCode.get(division)?.prizes, entrants, defaults.places),
    champion: (division: string) => championPrize(byCode.get(division)?.prizes, defaults.championState),
  };
}

/** Problems with a division's `prizes` (empty is fine). */
export function prizeIssues(d: PrizeDivision): string[] {
  const out: string[] = [];
  const tiers = d.prizes?.tiers;
  if (!tiers) return out;
  let prev = 0;
  tiers.forEach((t, i) => {
    if (!Number.isInteger(t.places) || t.places < 0 || t.places > 10) out.push(`${d.code}: prizes tier ${i + 1} places must be a whole number from 0 to 10`);
    if (t.upTo !== undefined) {
      if (!Number.isInteger(t.upTo) || t.upTo < 1) out.push(`${d.code}: prizes tier ${i + 1} upTo must be a whole number ≥ 1`);
      if (t.upTo <= prev) out.push(`${d.code}: prizes tiers must have increasing upTo`);
      prev = t.upTo;
    } else if (i !== tiers.length - 1) out.push(`${d.code}: only the last prizes tier may leave out upTo`);
  });
  if (tiers.length && tiers[tiers.length - 1].upTo !== undefined) out.push(`${d.code}: the last prizes tier should leave out upTo`);
  return out;
}
