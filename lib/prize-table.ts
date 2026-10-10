/**
 * Prize table (master plan S3): what each division awards, in words, for a public page. Pure; built from
 * the same rules as the prize plan (lib/prizes.ts), so the page and the admin plan can't disagree.
 */
import type { DivisionPrizes, PrizeTier } from './prizes';

export interface PrizeTableDivision { code: string; name: string; prizes?: DivisionPrizes; scoring: { format: string } }

export interface PrizeTableRow {
  code: string;
  name: string;
  /** One line per tier, e.g. "Up to 5 entrants: 1st place" */
  lines: string[];
  /** The home-state champion also gets a prize */
  champion: boolean;
}

const placesWords = (n: number): string => {
  if (n <= 0) return 'no prizes';
  if (n === 1) return '1st place';
  return `top ${n} places`;
};

/** "Up to 5 entrants", "6 to 10 entrants", "11 or more entrants" */
function rangeLabel(t: PrizeTier, prevUpTo: number): string {
  if (t.upTo === undefined) return prevUpTo === 0 ? 'Any number of entrants' : `${prevUpTo + 1} or more entrants`;
  if (prevUpTo === 0) return `Up to ${t.upTo} ${t.upTo === 1 ? 'entrant' : 'entrants'}`;
  return prevUpTo + 1 === t.upTo ? `${t.upTo} entrants` : `${prevUpTo + 1} to ${t.upTo} entrants`;
}

export function prizeTable(divisions: PrizeTableDivision[], defaults: { places: number; championState: string }): PrizeTableRow[] {
  return divisions
    .filter((d) => d.scoring.format !== 'showcase')
    .map((d) => {
      const tiers = d.prizes?.tiers;
      let lines: string[];
      if (!tiers?.length) {
        lines = [`${placesWords(defaults.places)[0].toUpperCase()}${placesWords(defaults.places).slice(1)}`];
      } else {
        let prev = 0;
        lines = tiers.map((t) => {
          const label = rangeLabel(t, prev);
          if (t.upTo !== undefined) prev = t.upTo;
          return `${label}: ${placesWords(t.places)}`;
        });
      }
      const champion = defaults.championState.trim() !== '' && d.prizes?.champion !== false;
      return { code: d.code, name: d.name, lines, champion };
    });
}
