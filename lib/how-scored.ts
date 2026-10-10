/**
 * How each division is scored, in plain words (master plan T11), and optional score shading (T12).
 * Pure: the words come from the division's own scoring config, so they can't drift from the maths.
 */
import type { DivisionDef } from '@/contest.config';

export interface HowScored {
  /** One line, the summary */
  headline: string;
  /** A note for each number on the results page */
  notes: string[];
}

const pts = (n: number) => `${n} ${n === 1 ? 'point' : 'points'}`;

export function howScored(d: DivisionDef): HowScored {
  const s = d.scoring;
  switch (s.format) {
    case 'freestyle': {
      const notes = [
        `Technical execution (out of ${s.techCap}): a judge counts the tricks you land${s.negativeClicks ? ' and takes one off for each miss' : ''}. Each judge scales their own tallies so the best run they saw earns ${s.techCap}, and everyone else is scored against it.`,
        `Four presentation scores, each out of ${s.evalCap}: trick presentation, performance quality, musicality and routine construction.`,
      ];
      if (s.deductions) {
        notes.push(`Deductions: ${pts(s.deductions.stop)} for each stop, ${pts(s.deductions.discard)} for each discard and ${pts(s.deductions.detach)} for each detach.`);
      }
      notes.push('A judge\'s total is technical execution plus the four presentation scores, minus deductions, never below 0. Your score is the average of the judges\' totals.');
      return { headline: `Freestyle, scored out of ${s.techCap + 4 * s.evalCap}`, notes };
    }
    case 'panel': {
      const max = s.criteria.reduce((n, c) => n + c.max, 0);
      return {
        headline: `Judged on ${s.criteria.length} ${s.criteria.length === 1 ? 'criterion' : 'criteria'}, out of ${max}`,
        notes: [
          ...s.criteria.map((c) => `${c.label}: out of ${c.max}.`),
          'A judge\'s total is the sum of the criteria. Your score is the average of the judges\' totals.',
        ],
      };
    }
    case 'manual': {
      const unit = s.unit ?? 'points';
      const attempts = s.attempts ?? 1;
      const lower = s.better === 'lower';
      return {
        headline: lower ? `Timed: lowest ${unit} wins` : `Scored in ${unit}`,
        notes: [
          attempts > 1
            ? `You get ${attempts} attempts and your ${lower ? 'lowest' : 'highest'} one counts.`
            : 'One attempt counts.',
          `${lower ? 'Lower' : 'Higher'} is better. With more than one judge, their numbers are averaged.`,
        ],
      };
    }
    case 'ladder': {
      const byPoints = s.rankBy === 'points';
      return {
        headline: `Trick ladder: ${s.tricks.length} tricks, ${s.attemptsPerTrick} ${s.attemptsPerTrick === 1 ? 'try' : 'tries'} each`,
        notes: byPoints
          ? ['You try every trick. Each one you land earns its points, and the most points wins.']
          : ['Tricks go in order. You move up a rung each time you land one, and stop at the first trick you miss on every try. The highest rung wins; ties go to the fewest tries used.'],
      };
    }
    case 'bracket':
      return {
        headline: `Battle bracket${s.matchFormat ? ` (${s.matchFormat})` : ''}`,
        notes: [
          s.decidedBy === 'audience' ? 'The audience votes on each match.' : 'Judges vote on each match.',
          s.thirdPlaceMatch ? 'There is a third-place match.' : 'There is no third-place match.',
          ...(s.rules ?? []),
        ],
      };
    case 'showcase':
      return { headline: 'Showcase (not judged)', notes: ['Performances only. There are no scores or places.'] };
  }
}

/**
 * Shading strength for each value, 0 (the worst on the table) to 1 (the best), so a results table can
 * show the gaps between places without reading every number. All values equal: no shading.
 */
export function shadeValues(values: number[], better: 'higher' | 'lower'): number[] {
  if (values.length === 0) return [];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (hi === lo) return values.map(() => 0);
  return values.map((v) => {
    const t = (v - lo) / (hi - lo);
    return Math.round((better === 'higher' ? t : 1 - t) * 100) / 100;
  });
}
