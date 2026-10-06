/**
 * Splitting a big division into a younger and an older bracket (site issue #81). Pure, so the
 * rule is tested without a database; the numbers come from the ages (on contest day) of the
 * division's paid entrants.
 *
 * Rule: at or below `above` entrants, one division. Above it, split only if both brackets would
 * have at least `minBracket` players. The suggested cut leans toward a natural line (the biggest
 * jump in ages between neighbouring players, e.g. kids vs adults) and, between equal gaps, the
 * cut nearest the mean age. The organizer decides; this only suggests and previews.
 */
export interface SplitRule { above: number; minBracket: number }

export interface AgeSpread { min: number; max: number; mean: number; median: number }

export interface SplitPreview {
  entrants: number;
  spread: AgeSpread | null;
  /** Players with age <= cutAge are in the younger bracket. null when not splitting. */
  cutAge: number | null;
  younger: number;
  older: number;
  shouldSplit: boolean;
  reason: 'few_entrants' | 'too_small' | 'ok';
  /** Every cut that leaves both brackets big enough, best first */
  candidates: { cutAge: number; younger: number; older: number; gap: number }[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function ageSpread(ages: number[]): AgeSpread | null {
  if (ages.length === 0) return null;
  const s = [...ages].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const median = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return { min: s[0], max: s[s.length - 1], mean: r1(s.reduce((a, b) => a + b, 0) / s.length), median };
}

/** How many players fall on each side of a cut (younger: age <= cutAge). */
export function countAtCut(ages: number[], cutAge: number): { younger: number; older: number } {
  const younger = ages.filter((a) => a <= cutAge).length;
  return { younger, older: ages.length - younger };
}

/** Every cut between two different ages that keeps both brackets at least `minBracket`, best first. */
export function splitCandidates(ages: number[], minBracket: number): SplitPreview['candidates'] {
  const s = [...ages].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / (s.length || 1);
  const distinct = [...new Set(s)];
  const out: SplitPreview['candidates'] = [];
  for (let i = 0; i < distinct.length - 1; i++) {
    const cutAge = distinct[i];
    const { younger, older } = countAtCut(s, cutAge);
    if (younger >= minBracket && older >= minBracket) out.push({ cutAge, younger, older, gap: distinct[i + 1] - cutAge });
  }
  return out.sort((a, b) => b.gap - a.gap || Math.abs(a.cutAge + a.gap / 2 - mean) - Math.abs(b.cutAge + b.gap / 2 - mean) || a.cutAge - b.cutAge);
}

/**
 * Preview the split for these ages. `chosenCut` is the organizer's own cut: it's used if given, even
 * when it leaves a small bracket (reason 'too_small'), so they can see what they'd be choosing.
 */
export function previewSplit(ages: number[], rule: SplitRule, chosenCut?: number | null): SplitPreview {
  const spread = ageSpread(ages);
  const candidates = splitCandidates(ages, rule.minBracket);
  const base = { entrants: ages.length, spread, candidates };
  if (ages.length <= rule.above) return { ...base, cutAge: null, younger: ages.length, older: 0, shouldSplit: false, reason: 'few_entrants' };

  const cut = chosenCut ?? candidates[0]?.cutAge ?? null;
  if (cut === null) return { ...base, cutAge: null, younger: ages.length, older: 0, shouldSplit: false, reason: 'too_small' };
  const { younger, older } = countAtCut(ages, cut);
  const ok = younger >= rule.minBracket && older >= rule.minBracket;
  return { ...base, cutAge: cut, younger, older, shouldSplit: ok, reason: ok ? 'ok' : 'too_small' };
}
