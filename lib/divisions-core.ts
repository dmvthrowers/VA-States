/**
 * Pure division logic shared by the server, the browser and the tests: fees, selection
 * rules, scoring math for every format (freestyle, panel, manual, ladder, bracket), rounds,
 * and the SQL that syncs divisions into the database.
 *
 * Takes the `competition` block from contest.config.ts as an argument (type-only import),
 * so `npm test` can run it under plain Node.
 */
import type {
  DivisionDef, EntryDef, FreestyleScoring, LadderScoring, ManualScoring, MusicConfig, MusicSlotDef, PanelScoring, RoundDef, Scoring,
  competition as Competition,
} from '@/contest.config';

type CompetitionConfig = typeof Competition;

/** Style codes picked per division, e.g. { X: ['2A'] } */
export type DivisionStyles = Record<string, string[]>;

export type RegistrationSource = 'online' | 'late_email' | 'walk_up' | 'soft_launch';

export interface FeeResult {
  fee_cents: number;
  combo_applied: boolean;
  early_bird_applied: boolean;
  walk_up_surcharge: boolean;
  is_comp: boolean;
  comp_discount_percent: number;
  comp_base_fee_cents: number;
}


// ---------------------------------------------------------------- scoring format capabilities

/*
 * What each scoring format can do, in one place. Code that used to ask "is this freestyle, panel or
 * manual?" asks formatCaps()/usesScoreSheet() instead, so a new format is one new row here (the type of
 * FORMATS makes TypeScript list every format that's missing) rather than a hunt through the pages.
 * The scoring math for each format is below and in lib/standings.ts; docs/FORMATS.md describes them;
 * docs/HUB_ROADMAP.md says where this is heading.
 */
export type ScoringFormat = Scoring['format'];

export interface FormatCaps {
  /** Short name for admin screens and docs */
  label: string;
  /** Judges enter a score for each entrant on a score sheet (POST /api/scores) */
  scoreSheet: boolean;
  /** Entrants perform in a run order that the DJ and judges follow */
  runOrder: boolean;
  /** The division can have rounds (prelims, finals) */
  rounds: boolean;
  /** Entrants are ranked against each other (showcases are not judged) */
  ranked: boolean;
  /** The format has its own judging screen and data, not the shared score sheet */
  ownScreen: boolean;
}

export const FORMATS: Record<ScoringFormat, FormatCaps> = {
  freestyle: { label: 'Freestyle', scoreSheet: true, runOrder: true, rounds: true, ranked: true, ownScreen: false },
  panel: { label: 'Panel', scoreSheet: true, runOrder: true, rounds: true, ranked: true, ownScreen: false },
  manual: { label: 'Manual score', scoreSheet: true, runOrder: true, rounds: true, ranked: true, ownScreen: false },
  ladder: { label: 'Trick ladder', scoreSheet: false, runOrder: false, rounds: false, ranked: true, ownScreen: true },
  bracket: { label: 'Battle bracket', scoreSheet: false, runOrder: false, rounds: false, ranked: true, ownScreen: true },
  showcase: { label: 'Showcase', scoreSheet: false, runOrder: true, rounds: false, ranked: false, ownScreen: false },
  addon: { label: 'Add-on (reuses another division\'s results)', scoreSheet: false, runOrder: false, rounds: false, ranked: true, ownScreen: false },
};

export const formatCaps = (format: ScoringFormat): FormatCaps => FORMATS[format];

/** Judges score it on the shared score sheet. */
export const usesScoreSheet = (format: ScoringFormat | undefined): boolean => !!format && FORMATS[format].scoreSheet;

/** Same question about a division's scoring, narrowing it to the formats that use the score sheet. */
export const hasScoreSheet = (s: Scoring): s is FreestyleScoring | PanelScoring | ManualScoring => FORMATS[s.format].scoreSheet;

/** It has a run order (DJ queue, "now performing"). */
export const usesRunOrder = (format: ScoringFormat | undefined): boolean => !!format && FORMATS[format].runOrder;

/** It can be split into rounds. */
export const supportsRounds = (format: ScoringFormat | undefined): boolean => !!format && FORMATS[format].rounds;

/** A division's entry rules (solo unless it says otherwise). */
export const entryOf = (d: DivisionDef | undefined): EntryDef => d?.entry ?? { type: 'solo' };
export const isTeamDivision = (d: DivisionDef | undefined) => entryOf(d).type === 'team';

/** A division's rounds (one unnamed round unless it says otherwise; brackets/ladders/showcases have one). */
export function roundsOf(d: DivisionDef | undefined): RoundDef[] {
  const multi = d && ['freestyle', 'panel', 'manual'].includes(d.scoring.format) && d.rounds?.length;
  return multi ? d!.rounds! : [{ name: 'Final' }];
}

// ---------------------------------------------------------------- music slots

const MUSIC_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,29}$/;
export const MAIN_MUSIC_SLOT = 'main';

/** A round's music key: its own `key`, else its name as lowercase-and-dashes ("Semi-final" → "semi-final"). */
export function roundKey(r: RoundDef, index = 0): string {
  const slug = (r.key ?? r.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  return slug || `round-${index + 1}`;
}

const musicConfigOf = (d: DivisionDef | undefined): MusicConfig | null =>
  !d || !d.music ? null : d.music === true ? {} : d.music;

/**
 * The music tracks a player uploads for a division, in order: the routine track (one for the
 * division, or one per round), then any extras. Empty when the division has no music.
 */
export function musicSlotsOf(d: DivisionDef | undefined): MusicSlotDef[] {
  const m = musicConfigOf(d);
  if (!m) return [];
  const out: MusicSlotDef[] = [];
  if (m.routine !== false) {
    if (m.perRound) roundsOf(d).forEach((r, i) => out.push({ key: roundKey(r, i), label: r.name }));
    else out.push({ key: MAIN_MUSIC_SLOT, label: 'Routine music' });
  }
  for (const e of m.extra ?? []) out.push(e);
  return out;
}

export const hasMusic = (d: DivisionDef | undefined): boolean => musicSlotsOf(d).length > 0;

/**
 * Which slot the DJ plays for a round (1-based): that round's track, the division's one routine
 * track, or the first extra when there is no routine music (a battle division).
 */
export function playSlotFor(d: DivisionDef | undefined, round = 1): string | null {
  const m = musicConfigOf(d);
  if (!m) return null;
  if (m.routine !== false) {
    if (!m.perRound) return MAIN_MUSIC_SLOT;
    const r = roundsOf(d)[round - 1];
    return r ? roundKey(r, round - 1) : null;
  }
  return m.extra?.[0]?.key ?? null;
}

/** Routine length in seconds for a round (1-based): the round's own, else the division's, else null. */
export function routineSecondsOf(d: DivisionDef | undefined, round = 1): number | null {
  return roundsOf(d)[round - 1]?.seconds ?? d?.routineSeconds ?? null;
}

/** 90 → "1:30", 180 → "3:00" */
export function formatRoutineTime(totalSeconds: number): string {
  const t = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/**
 * Divisions this registrant pays nothing for: team divisions priced per team, where they're
 * joining someone else's team (the captain pays).
 */
export function freeTeamJoins(c: CompetitionConfig, joining: string[] = []): string[] {
  return joining.filter((code) => {
    const e = entryOf(c.divisions.find((d) => d.code === code));
    return e.type === 'team' && e.pricing === 'team';
  });
}

/**
 * Sum of division prices, with each combo applied at most once (first listed wins on overlap).
 * `joining` lists team divisions where this person joins an existing team.
 */
export function baseFeeCents(selected: string[], c: CompetitionConfig, joining: string[] = []): { cents: number; combo: boolean } {
  const free = freeTeamJoins(c, joining);
  let remaining = [...new Set(selected)].filter((d) => !free.includes(d));
  let cents = 0;
  let combo = false;
  for (const k of c.combos) {
    if (k.divisions.length > 0 && k.divisions.every((d) => remaining.includes(d))) {
      cents += k.priceCents;
      remaining = remaining.filter((d) => !k.divisions.includes(d));
      combo = true;
    }
  }
  for (const code of remaining) {
    cents += c.divisions.find((d) => d.code === code)?.priceCents ?? 0;
  }
  return { cents, combo };
}

/**
 * Fee rules, in this order:
 * 1. Comp code → its discount_percent off the combo-adjusted fee; replaces early bird and walk-up.
 * 2. Combos (contest.config.ts → competition.combos)
 * 3. Early bird (before earlyBirdCutoff) → −earlyBirdDiscountCents, floor at $0
 * 4. Walk-up / late-email → +walkUpSurchargeCents
 */
export function computeFee(
  selected: string[],
  c: CompetitionConfig,
  compDiscountPercent: number,
  registrationDate: Date,
  source: RegistrationSource,
  earlyBirdCutoff: Date,
  /** Team divisions where this person joins someone else's team (see freeTeamJoins) */
  joining: string[] = [],
): FeeResult {
  const { cents: baseFee, combo: combo_applied } = baseFeeCents(selected, c, joining);

  if (compDiscountPercent > 0) {
    const pct = Math.min(100, Math.max(0, compDiscountPercent));
    const fee = Math.round(baseFee * (100 - pct) / 100);
    return {
      fee_cents: fee, combo_applied, early_bird_applied: false, walk_up_surcharge: false,
      is_comp: fee === 0, comp_discount_percent: pct, comp_base_fee_cents: baseFee,
    };
  }

  let fee = baseFee;
  const early_bird_applied = registrationDate < earlyBirdCutoff;
  if (early_bird_applied && baseFee > 0) fee = Math.max(0, fee - c.pricing.earlyBirdDiscountCents);
  const walk_up_surcharge = source === 'walk_up' || source === 'late_email';
  if (walk_up_surcharge) fee += c.pricing.walkUpSurchargeCents;

  return {
    fee_cents: fee, combo_applied, early_bird_applied, walk_up_surcharge,
    is_comp: false, comp_discount_percent: 0, comp_base_fee_cents: baseFee,
  };
}

export interface SelectionIssue {
  path: 'divisions' | 'division_styles';
  message: string;
}

/**
 * Checks a division + style selection against the config. Empty array = valid.
 * Pass `opts.age` (age on contest day) to also check an add-on's age limits.
 */
export function selectionIssues(selected: string[], styles: DivisionStyles, c: CompetitionConfig, opts: { age?: number } = {}): SelectionIssue[] {
  const issues: SelectionIssue[] = [];
  const byCode = new Map(c.divisions.map((d) => [d.code, d]));

  if (selected.length === 0) issues.push({ path: 'divisions', message: 'Select at least one division' });
  for (const code of selected) {
    if (!byCode.has(code)) issues.push({ path: 'divisions', message: `Unknown division: ${code}` });
  }
  for (const code of selected) {
    const d = byCode.get(code);
    for (const other of d?.cannotCombineWith ?? []) {
      if (selected.includes(other)) {
        issues.push({ path: 'divisions', message: `${d!.name} can't be combined with ${byCode.get(other)?.name ?? other}` });
      }
    }
  }
  for (const code of selected) {
    const d = byCode.get(code);
    if (d?.scoring.format !== 'addon') continue;
    const parent = byCode.get(d.scoring.parent);
    if (!selected.includes(d.scoring.parent)) {
      issues.push({ path: 'divisions', message: `${d.name} is a free add-on to ${parent?.name ?? d.scoring.parent}. Select ${parent?.name ?? d.scoring.parent} too.` });
    }
    const { minAge, maxAge } = d.scoring;
    if (opts.age !== undefined && ((minAge !== undefined && opts.age < minAge) || (maxAge !== undefined && opts.age > maxAge))) {
      const range = minAge !== undefined && maxAge !== undefined ? `${minAge}–${maxAge}` : minAge !== undefined ? `${minAge} and up` : `${maxAge} and under`;
      issues.push({ path: 'divisions', message: `${d.name} is for ages ${range}` });
    }
  }
  for (const [code, picked] of Object.entries(styles)) {
    if (picked.length === 0) continue;
    const d = byCode.get(code);
    if (!selected.includes(code) || !d?.styles) {
      issues.push({ path: 'division_styles', message: `Styles were picked for ${d?.name ?? code}, which isn't selected` });
      continue;
    }
    const valid = new Set(d.styles.options.map((o) => o.code));
    for (const s of picked) {
      if (!valid.has(s)) issues.push({ path: 'division_styles', message: `Unknown ${d.name} style: ${s}` });
    }
  }
  for (const code of selected) {
    const d = byCode.get(code);
    if (!d?.styles) continue;
    const n = new Set(styles[code] ?? []).size;
    if (n < d.styles.min || n > d.styles.max) {
      const range = d.styles.min === d.styles.max ? `${d.styles.min}` : `${d.styles.min}–${d.styles.max}`;
      issues.push({ path: 'division_styles', message: `Choose ${range} ${d.name} style${d.styles.max === 1 ? '' : 's'}` });
    }
  }
  if (c.maxTotalStyles !== undefined) {
    // A division with styles counts the styles picked; one without counts as one style.
    const total = selected.reduce((n, code) => {
      const d = byCode.get(code);
      if (!d) return n;
      return n + (d.styles ? new Set(styles[code] ?? []).size : 1);
    }, 0);
    if (total > c.maxTotalStyles) {
      issues.push({
        path: 'division_styles',
        message: `You can enter at most ${c.maxTotalStyles} styles in total (a division without styles counts as one)`,
      });
    }
  }
  return dedupe(issues);
}

/**
 * The most styles `code` can take right now: its own max, lowered by competition.maxTotalStyles
 * once the other selected divisions are counted (a styled division counts its picked styles, an
 * unstyled one counts as one). Never below its min, so the picker still shows the requirement.
 */
export function styleCap(code: string, selected: string[], styles: DivisionStyles, c: CompetitionConfig): number {
  const d = c.divisions.find((x) => x.code === code);
  if (!d?.styles) return 0;
  if (c.maxTotalStyles === undefined) return d.styles.max;
  const others = selected.reduce((n, other) => {
    if (other === code) return n;
    const od = c.divisions.find((x) => x.code === other);
    if (!od) return n;
    return n + (od.styles ? new Set(styles[other] ?? []).size : 1);
  }, 0);
  return Math.max(d.styles.min, Math.min(d.styles.max, c.maxTotalStyles - others));
}

function dedupe(issues: SelectionIssue[]): SelectionIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => (seen.has(i.message) ? false : (seen.add(i.message), true)));
}

/** Drop empty style lists and styles for divisions that aren't selected. */
export function cleanStyles(selected: string[], styles: DivisionStyles | undefined): DivisionStyles {
  const out: DivisionStyles = {};
  for (const [code, picked] of Object.entries(styles ?? {})) {
    const uniq = [...new Set(picked)];
    if (selected.includes(code) && uniq.length > 0) out[code] = uniq;
  }
  return out;
}

// ---------------------------------------------------------------- scoring

/** The style a score counts under: the one the judge picked, else the registrant's only style. */
export function effectiveStyle(scoreStyle: string | null | undefined, registered: string[] | undefined): string | null {
  if (scoreStyle) return scoreStyle;
  return registered && registered.length === 1 ? registered[0] : null;
}

export function styleMultiplier(d: DivisionDef | undefined, style: string | null): number {
  if (!d || d.scoring.format !== 'freestyle' || !style) return 1;
  return d.styles?.options.find((o) => o.code === style)?.multiplier ?? 1;
}

export interface FreestyleSheet {
  tech_execution_raw: number;
  trick_presentation: number;
  performance_quality: number;
  musicality: number;
  routine_construction: number;
  stop_count: number;
  discard_count: number;
  detach_count: number;
}

export interface ScoreBreakdown {
  tech_execution_normalized: number;
  total_eval: number;
  deduction_points: number;
  final_score: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Freestyle: a judge's own highest positive (multiplied) raw tally maps to techCap and
 * everyone else scales from it. Final = tech + eval − deductions, floored at 0.
 * Mirrors the vsyc_results view; keep the two in sync.
 */
export function freestyleBreakdown(s: FreestyleSheet, scoring: FreestyleScoring, multiplier: number, judgeMaxRaw: number | null): ScoreBreakdown {
  const tech = judgeMaxRaw === null || s.tech_execution_raw <= 0
    ? 0
    : Math.min(scoring.techCap, r2((s.tech_execution_raw * multiplier / judgeMaxRaw) * scoring.techCap));
  const totalEval = r2(s.trick_presentation + s.performance_quality + s.musicality + s.routine_construction);
  const ded = scoring.deductions
    ? s.stop_count * scoring.deductions.stop + s.discard_count * scoring.deductions.discard + s.detach_count * scoring.deductions.detach
    : 0;
  return { tech_execution_normalized: tech, total_eval: totalEval, deduction_points: ded, final_score: Math.max(0, r2(tech + totalEval - ded)) };
}

export function manualBreakdown(score: number, scoring: ManualScoring): ScoreBreakdown {
  const v = Math.min(scoring.max, Math.max(0, r2(score)));
  return { tech_execution_normalized: 0, total_eval: 0, deduction_points: 0, final_score: v };
}

/** Which way a division ranks: "lower" only for manual divisions that say so (speed, time). */
export function betterOf(s: Scoring | undefined): 'higher' | 'lower' {
  return s?.format === 'manual' && s.better === 'lower' ? 'lower' : 'higher';
}

/** Best of a manual division's attempts (blank attempts ignored), clamped to 0–max. */
export function manualBest(attempts: (number | null | undefined)[], scoring: ManualScoring): number | null {
  const vals = attempts.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    .map((v) => Math.min(scoring.max, Math.max(0, r2(v))));
  if (vals.length === 0) return null;
  return betterOf(scoring) === 'lower' ? Math.min(...vals) : Math.max(...vals);
}

/** Panel: the sum of the criteria scores, each clamped to its max. Unknown keys are ignored. */
export function panelTotal(scores: Record<string, number | null | undefined>, scoring: PanelScoring): number {
  return r2(scoring.criteria.reduce((sum, c) => sum + Math.min(c.max, Math.max(0, Number(scores[c.key]) || 0)), 0));
}

export const panelMax = (scoring: PanelScoring) => scoring.criteria.reduce((sum, c) => sum + c.max, 0);

/** Sort comparator for averaged scores in a division (best first). */
export function compareScores(better: 'higher' | 'lower') {
  return (a: number, b: number) => (better === 'lower' ? a - b : b - a);
}

// ---------------------------------------------------------------- ladder

export interface LadderAttempt {
  trick_index: number;
  attempt: number;
  landed: boolean;
}

export interface LadderResult {
  /** Tricks landed in a row from the bottom (rung) */
  rung: number;
  /** Sum of points for landed tricks (rankBy "points") */
  points: number;
  /** Attempts used on counted tricks; fewer wins a tie */
  attemptsUsed: number;
  /** Per trick: landed on which attempt (1-based), or null if missed / not tried */
  landedOn: (number | null)[];
  /** True once the player is out (missed every attempt at a trick, rung mode) or finished the list */
  done: boolean;
}

export function ladderResult(rows: LadderAttempt[], scoring: LadderScoring): LadderResult {
  const n = scoring.tricks.length;
  const landedOn: (number | null)[] = Array(n).fill(null);
  const tries: number[] = Array(n).fill(0);
  for (const r of rows) {
    if (r.trick_index < 0 || r.trick_index >= n || r.attempt < 1 || r.attempt > scoring.attemptsPerTrick) continue;
    tries[r.trick_index] = Math.max(tries[r.trick_index], r.attempt);
    if (r.landed && (landedOn[r.trick_index] === null || r.attempt < landedOn[r.trick_index]!)) landedOn[r.trick_index] = r.attempt;
  }
  if ((scoring.rankBy ?? 'rung') === 'points') {
    let points = 0, attemptsUsed = 0;
    landedOn.forEach((a, i) => { if (a !== null) points += scoring.tricks[i].points ?? 1; attemptsUsed += a ?? tries[i]; });
    const done = tries.every((t, i) => landedOn[i] !== null || t >= scoring.attemptsPerTrick);
    return { rung: landedOn.filter((a) => a !== null).length, points, attemptsUsed, landedOn, done };
  }
  let rung = 0, attemptsUsed = 0, done = false;
  for (let i = 0; i < n; i++) {
    if (landedOn[i] !== null) { rung++; attemptsUsed += landedOn[i]!; continue; }
    if (tries[i] >= scoring.attemptsPerTrick) { attemptsUsed += tries[i]; done = true; }
    break;
  }
  if (rung === n) done = true;
  const points = landedOn.slice(0, rung).reduce<number>((s2, _a, i) => s2 + (scoring.tricks[i].points ?? 1), 0);
  return { rung, points, attemptsUsed, landedOn, done };
}

/** Ladder ranking: more rungs (or points) first, then fewer attempts. */
export function compareLadder(scoring: LadderScoring) {
  const key = (scoring.rankBy ?? 'rung') === 'points' ? 'points' : 'rung';
  return (a: LadderResult, b: LadderResult) => b[key] - a[key] || a.attemptsUsed - b.attemptsUsed;
}

/** The next trick and attempt to record for a player (rung mode), or null when they're done. */
export function ladderNext(result: LadderResult, rows: LadderAttempt[], scoring: LadderScoring): { trick_index: number; attempt: number } | null {
  if (result.done) return null;
  if ((scoring.rankBy ?? 'rung') === 'points') {
    for (let i = 0; i < scoring.tricks.length; i++) {
      if (result.landedOn[i] !== null) continue;
      const used = Math.max(0, ...rows.filter((r) => r.trick_index === i).map((r) => r.attempt));
      if (used < scoring.attemptsPerTrick) return { trick_index: i, attempt: used + 1 };
    }
    return null;
  }
  const i = result.rung;
  const used = Math.max(0, ...rows.filter((r) => r.trick_index === i).map((r) => r.attempt));
  return { trick_index: i, attempt: used + 1 };
}

// ---------------------------------------------------------------- bracket

export interface BracketMatch {
  round: number;
  /** 1-based position within the round */
  position: number;
  entry_a: string | null;
  entry_b: string | null;
  winner: string | null;
  /** Third-place match (losers of the semifinals) */
  is_third_place: boolean;
  /** Audience-decided brackets: the poll's vote counts for each side */
  votes_a?: number | null;
  votes_b?: number | null;
}

/** Smallest power of two ≥ n (minimum 2). */
export function bracketSize(n: number): number {
  let size = 2;
  while (size < n) size *= 2;
  return size;
}

/** Standard seed order for a bracket of `size`: 1 plays size, 2 plays size−1, … spread apart. */
export function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const next = order.length * 2 + 1;
    order = order.flatMap((s) => [s, next - s]);
  }
  return order;
}

export const bracketRounds = (size: number) => Math.log2(size);

/**
 * First-round matches for entrants in seed order (best seed first). Top seeds get the byes,
 * and a bye's winner is filled in and carried into round 2 right away.
 */
export function buildBracket(entrants: string[], thirdPlaceMatch: boolean): BracketMatch[] {
  if (entrants.length < 2) return [];
  const size = bracketSize(entrants.length);
  const rounds = bracketRounds(size);
  const order = seedOrder(size);
  const matches: BracketMatch[] = [];
  for (let r = 1; r <= rounds; r++) {
    for (let p = 1; p <= size / 2 ** r; p++) {
      matches.push({ round: r, position: p, entry_a: null, entry_b: null, winner: null, is_third_place: false });
    }
  }
  if (thirdPlaceMatch && rounds >= 2) {
    matches.push({ round: rounds, position: 2, entry_a: null, entry_b: null, winner: null, is_third_place: true });
  }
  for (let p = 1; p <= size / 2; p++) {
    const m = matches.find((x) => x.round === 1 && x.position === p)!;
    m.entry_a = entrants[order[2 * p - 2] - 1] ?? null;
    m.entry_b = entrants[order[2 * p - 1] - 1] ?? null;
  }
  for (const m of matches.filter((x) => x.round === 1)) {
    if ((m.entry_a === null) !== (m.entry_b === null)) setWinner(matches, m, (m.entry_a ?? m.entry_b)!);
  }
  return matches;
}

const findMatch = (ms: BracketMatch[], round: number, position: number, third = false) =>
  ms.find((m) => m.round === round && m.position === position && m.is_third_place === third);

/**
 * Record a winner and move them into the next round (and the semifinal loser into the
 * third-place match). Clears any later results that depended on an earlier, different winner.
 * Returns the matches it changed.
 */
export function setWinner(matches: BracketMatch[], match: BracketMatch, winner: string): BracketMatch[] {
  if (winner !== match.entry_a && winner !== match.entry_b) throw new Error('Winner must be one of the two entrants');
  const changed: BracketMatch[] = [match];
  match.winner = winner;
  if (match.is_third_place) return changed;
  const rounds = Math.max(...matches.filter((m) => !m.is_third_place).map((m) => m.round));
  if (match.round === rounds) return changed;
  const next = findMatch(matches, match.round + 1, Math.ceil(match.position / 2))!;
  const slot = match.position % 2 === 1 ? 'entry_a' : 'entry_b';
  if (next[slot] !== winner) {
    clearDownstream(matches, next, changed);
    next[slot] = winner;
  }
  changed.push(next);
  const third = findMatch(matches, rounds, 2, true);
  if (third && match.round === rounds - 1) {
    const loser = winner === match.entry_a ? match.entry_b : match.entry_a;
    const tslot = match.position % 2 === 1 ? 'entry_a' : 'entry_b';
    if (third[tslot] !== loser) { third.winner = null; third[tslot] = loser; }
    changed.push(third);
  }
  return [...new Set(changed)];
}

function clearDownstream(matches: BracketMatch[], m: BracketMatch, changed: BracketMatch[]) {
  if (m.winner === null) return;
  const old = m.winner;
  m.winner = null;
  changed.push(m);
  const rounds = Math.max(...matches.filter((x) => !x.is_third_place).map((x) => x.round));
  if (m.round === rounds) return;
  const next = findMatch(matches, m.round + 1, Math.ceil(m.position / 2))!;
  const slot = m.position % 2 === 1 ? 'entry_a' : 'entry_b';
  if (next[slot] === old) { clearDownstream(matches, next, changed); next[slot] = null; changed.push(next); }
  // A semifinal without a result has no loser yet: empty their side of the third-place match.
  const third = findMatch(matches, rounds, 2, true);
  if (third && !m.is_third_place && m.round === rounds - 1 && third[slot] !== null) {
    third[slot] = null;
    third.winner = null;
    changed.push(third);
  }
}

/**
 * Final placements so far: 1st/2nd from the final, 3rd/4th from the third-place match. Without
 * one, the semifinal losers tie for 3rd, or (thirdPlaceByVotes) are ranked by the votes they got
 * across the bracket.
 */
export function bracketPlacements(matches: BracketMatch[], opts: { thirdPlaceByVotes?: boolean } = {}): { entry: string; place: number }[] {
  const main = matches.filter((m) => !m.is_third_place);
  if (main.length === 0) return [];
  const rounds = Math.max(...main.map((m) => m.round));
  const out: { entry: string; place: number }[] = [];
  const final = findMatch(matches, rounds, 1);
  if (final?.winner) {
    out.push({ entry: final.winner, place: 1 });
    const runnerUp = final.winner === final.entry_a ? final.entry_b : final.entry_a;
    if (runnerUp) out.push({ entry: runnerUp, place: 2 });
  }
  const third = findMatch(matches, rounds, 2, true);
  if (third) {
    if (third.winner) {
      out.push({ entry: third.winner, place: 3 });
      const fourth = third.winner === third.entry_a ? third.entry_b : third.entry_a;
      if (fourth) out.push({ entry: fourth, place: 4 });
    }
  } else if (rounds >= 2) {
    const losers = main.filter((m) => m.round === rounds - 1 && m.winner)
      .map((semi) => (semi.winner === semi.entry_a ? semi.entry_b : semi.entry_a))
      .filter((e): e is string => !!e);
    if (opts.thirdPlaceByVotes && losers.length === 2) {
      const [x, y] = losers.map((e) => ({ e, v: voteTotal(matches, e) })).sort((a, b) => b.v - a.v);
      out.push({ entry: x.e, place: 3 }, { entry: y.e, place: x.v === y.v ? 3 : 4 });
    } else {
      for (const loser of losers) out.push({ entry: loser, place: 3 });
    }
  }
  return out;
}

/** Audience votes an entrant received across every match they were in. */
export function voteTotal(matches: BracketMatch[], entry: string): number {
  return matches.reduce((sum, m) =>
    sum + (m.entry_a === entry ? m.votes_a ?? 0 : 0) + (m.entry_b === entry ? m.votes_b ?? 0 : 0), 0);
}

/** For audience brackets: the side with more poll votes, or null on a tie / no counts. */
export function pollWinner(m: BracketMatch): string | null {
  const a = m.votes_a ?? 0, b = m.votes_b ?? 0;
  if (a === b) return null;
  return a > b ? m.entry_a : m.entry_b;
}

/** The pick most judges made, or null on a tie / no votes. */
export function majorityPick(votes: ('a' | 'b')[]): 'a' | 'b' | null {
  const a = votes.filter((v) => v === 'a').length, b = votes.length - a;
  return a === b ? null : a > b ? 'a' : 'b';
}

// ---------------------------------------------------------------- rounds

/** Who moves on from a round: the top `advance` of a ranked list (ties at the cut all go through). */
export function advancers<T>(ranked: T[], advance: number, scoreOf: (t: T) => number): T[] {
  if (advance <= 0 || ranked.length <= advance) return [...ranked];
  const cut = scoreOf(ranked[advance - 1]);
  return ranked.filter((t, i) => i < advance || scoreOf(t) === cut);
}

/** Human summary of how a division is judged, for cards, judges and the results page. */
export function formatSummary(d: DivisionDef): string {
  const s = d.scoring;
  switch (s.format) {
    case 'freestyle': return `Freestyle, scored out of ${s.techCap + 4 * s.evalCap}`;
    case 'panel': return `Judged on ${s.criteria.map((c) => c.label.toLowerCase()).join(', ')} (out of ${panelMax(s)})`;
    case 'manual': {
      const unit = s.unit ?? 'points';
      const att = (s.attempts ?? 1) > 1 ? `, best of ${s.attempts} attempts` : '';
      return s.better === 'lower' ? `Timed: lowest ${unit} wins${att}` : `Scored in ${unit}${att}`;
    }
    case 'ladder': return `Trick ladder: ${s.tricks.length} tricks, ${s.attemptsPerTrick} ${s.attemptsPerTrick === 1 ? 'try' : 'tries'} each`;
    case 'bracket': return `Battle bracket${s.matchFormat ? ` (${s.matchFormat})` : ''}${s.decidedBy === 'audience' ? ', audience vote' : ', judges vote'}`;
    case 'showcase': return 'Showcase (not judged)';
    case 'addon': return 'Free add-on: placed from the main division\'s results';
  }
}

// ---------------------------------------------------------------- database sync

const CODE_RE = /^[A-Za-z0-9_-]{1,20}$/;
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const num = (n: number) => (Number.isFinite(n) ? String(n) : '0');

/** Problems with the competition config itself (bad codes, duplicates, bad caps). */
export function configIssues(c: CompetitionConfig): string[] {
  const out: string[] = [];
  const codes = c.divisions.map((d) => d.code);
  if (codes.length === 0) out.push('competition.divisions is empty');
  for (const d of c.divisions) {
    if (!CODE_RE.test(d.code)) out.push(`Division code "${d.code}" must be 1–20 letters, numbers, - or _`);
    if (codes.filter((x) => x === d.code).length > 1) out.push(`Duplicate division code "${d.code}"`);
    if (d.priceCents < 0 || !Number.isInteger(d.priceCents)) out.push(`${d.code}: priceCents must be a whole number ≥ 0`);
    for (const o of d.cannotCombineWith ?? []) if (!codes.includes(o)) out.push(`${d.code}: cannotCombineWith names unknown division "${o}"`);
    if (d.styles) {
      const sc = d.styles.options.map((o) => o.code);
      if (sc.length === 0) out.push(`${d.code}: styles.options is empty`);
      for (const s of sc) {
        if (!CODE_RE.test(s)) out.push(`${d.code}: style code "${s}" must be 1–20 letters, numbers, - or _`);
        if (sc.filter((x) => x === s).length > 1) out.push(`${d.code}: duplicate style "${s}"`);
      }
      if (d.styles.min < 0 || d.styles.max < Math.max(1, d.styles.min) || d.styles.max > sc.length) {
        out.push(`${d.code}: styles.min/max must satisfy 0 ≤ min ≤ max ≤ number of styles, max ≥ 1`);
      }
    }
    out.push(...scoringIssues(d));
    out.push(...musicIssues(d));
    if (d.scoring.format === 'addon') {
      const parent = c.divisions.find((x) => x.code === (d.scoring as { parent: string }).parent);
      if (!parent) out.push(`${d.code}: add-on parent "${(d.scoring as { parent: string }).parent}" is not a division`);
      else if (parent.scoring.format === 'addon' || parent.scoring.format === 'showcase') out.push(`${d.code}: an add-on's parent must be a ranked division, not ${parent.scoring.format === 'addon' ? 'another add-on' : 'a showcase'}`);
      else if (entryOf(parent).type !== 'solo') out.push(`${d.code}: an add-on's parent must be a solo division`);
    }
  }
  for (const k of c.combos) {
    for (const code of k.divisions) if (!codes.includes(code)) out.push(`combo names unknown division "${code}"`);
    if (k.divisions.length < 2) out.push('a combo needs at least two divisions');
  }
  return out;
}

function musicIssues(d: DivisionDef): string[] {
  const out: string[] = [];
  const m = musicConfigOf(d);
  if (!m) return out;
  if (m.routine === false && !(m.extra?.length)) out.push(`${d.code}: music has routine: false but no extra tracks, so there is nothing to upload`);
  if (m.perRound && (!d.rounds || d.rounds.length === 0)) out.push(`${d.code}: music.perRound needs the division to have rounds`);
  for (const e of m.extra ?? []) {
    if (!MUSIC_KEY_RE.test(e.key)) out.push(`${d.code}: music extra key "${e.key}" must be lowercase letters, numbers, - or _ (up to 30)`);
    if (e.key === MAIN_MUSIC_SLOT) out.push(`${d.code}: music extra key "main" is reserved for the routine track`);
    if (!e.label.trim()) out.push(`${d.code}: music extra "${e.key}" needs a label`);
  }
  const keys = musicSlotsOf(d).map((x) => x.key);
  for (const k of keys) {
    if (!MUSIC_KEY_RE.test(k)) out.push(`${d.code}: music track key "${k}" must be lowercase letters, numbers, - or _ (up to 30); give the round a key`);
    if (keys.filter((x) => x === k).length > 1) out.push(`${d.code}: two music tracks share the key "${k}"`);
  }
  return out;
}

export function scoringIssues(d: DivisionDef): string[] {
  const out: string[] = [];
  const sc = d.scoring;
  const KEY_RE = /^[a-z][a-z0-9_]{0,30}$/;
  switch (sc.format) {
    case 'freestyle':
      if (!(sc.techCap > 0 && sc.techCap <= 1000) || !(sc.evalCap > 0 && sc.evalCap <= 99)) out.push(`${d.code}: freestyle techCap must be 1–1000 and evalCap 1–99`);
      break;
    case 'manual':
      if (!(sc.max > 0 && sc.max <= 99999)) out.push(`${d.code}: manual max must be 1–99999`);
      if (sc.attempts !== undefined && !(Number.isInteger(sc.attempts) && sc.attempts >= 1 && sc.attempts <= 10)) out.push(`${d.code}: manual attempts must be 1–10`);
      break;
    case 'panel': {
      if (sc.criteria.length === 0 || sc.criteria.length > 12) out.push(`${d.code}: panel needs 1–12 criteria`);
      const keys = sc.criteria.map((c) => c.key);
      for (const c of sc.criteria) {
        if (!KEY_RE.test(c.key)) out.push(`${d.code}: criterion key "${c.key}" must be lowercase letters, numbers or _`);
        if (keys.filter((k) => k === c.key).length > 1) out.push(`${d.code}: duplicate criterion "${c.key}"`);
        if (!(c.max > 0 && c.max <= 1000)) out.push(`${d.code}: criterion "${c.key}" max must be 1–1000`);
      }
      break;
    }
    case 'ladder':
      if (sc.tricks.length === 0 || sc.tricks.length > 100) out.push(`${d.code}: ladder needs 1–100 tricks`);
      if (!(Number.isInteger(sc.attemptsPerTrick) && sc.attemptsPerTrick >= 1 && sc.attemptsPerTrick <= 10)) out.push(`${d.code}: ladder attemptsPerTrick must be 1–10`);
      for (const t of sc.tricks) if (!t.name.trim()) out.push(`${d.code}: a ladder trick has no name`);
      break;
    case 'bracket': {
      const ms = sc.matchScoring;
      if (ms) {
        if (!(Number.isInteger(ms.to) && ms.to >= 1 && ms.to <= 99)) out.push(`${d.code}: matchScoring.to must be a whole number from 1 to 99`);
        if (ms.finalsTo !== undefined && !(Number.isInteger(ms.finalsTo) && ms.finalsTo >= 1 && ms.finalsTo <= 99)) out.push(`${d.code}: matchScoring.finalsTo must be a whole number from 1 to 99`);
      }
      break;
    }
    case 'showcase':
      break;
    case 'addon': {
      if (d.priceCents !== 0) out.push(`${d.code}: an add-on division must cost $0 (priceCents: 0)`);
      if (hasMusic(d)) out.push(`${d.code}: an add-on division has no music of its own`);
      if (d.styles) out.push(`${d.code}: an add-on division can't have styles`);
      if (d.entry && d.entry.type !== 'solo') out.push(`${d.code}: an add-on division is solo`);
      for (const [k, v] of [['minAge', sc.minAge], ['maxAge', sc.maxAge]] as const) {
        if (v !== undefined && !(Number.isInteger(v) && v >= 1 && v <= 120)) out.push(`${d.code}: ${k} must be a whole number from 1 to 120`);
      }
      if (sc.minAge !== undefined && sc.maxAge !== undefined && sc.minAge > sc.maxAge) out.push(`${d.code}: minAge is above maxAge`);
      break;
    }
  }
  const e = entryOf(d);
  if (e.type === 'team' && !(Number.isInteger(e.min) && Number.isInteger(e.max) && e.min >= 1 && e.max >= Math.max(2, e.min) && e.max <= 50)) {
    out.push(`${d.code}: team entries need 1 ≤ min ≤ max, max between 2 and 50`);
  }
  if (d.rounds && d.rounds.length > 0) {
    if (!['freestyle', 'panel', 'manual'].includes(sc.format)) out.push(`${d.code}: rounds only apply to freestyle, panel and manual divisions`);
    if (d.rounds.length > 5) out.push(`${d.code}: at most 5 rounds`);
    d.rounds.forEach((r, i) => {
      const last = i === d.rounds!.length - 1;
      if (!last && !(Number.isInteger(r.advance) && r.advance! >= 1)) out.push(`${d.code}: round "${r.name}" needs advance ≥ 1`);
      if (last && r.advance !== undefined) out.push(`${d.code}: the last round can't have advance`);
      if (r.seconds !== undefined && !SECONDS_OK(r.seconds)) out.push(`${d.code}: round "${r.name}" seconds must be a whole number 5–3600`);
    });
  }
  if (d.routineSeconds !== undefined && !SECONDS_OK(d.routineSeconds)) out.push(`${d.code}: routineSeconds must be a whole number 5–3600`);
  return out;
}

const SECONDS_OK = (n: number) => Number.isInteger(n) && n >= 5 && n <= 3600;

/** Idempotent SQL that makes vsyc_divisions / vsyc_division_styles match the config. */
export function divisionsSql(c: CompetitionConfig): string {
  const issues = configIssues(c);
  if (issues.length) throw new Error(`contest.config.ts competition block:\n- ${issues.join('\n- ')}`);

  const rows = c.divisions.map((d, i) => {
    const s = d.scoring;
    const f = s.format === 'freestyle' ? s : null;
    const e = entryOf(d);
    const config = JSON.stringify({ scoring: s, entry: e, rounds: roundsOf(d) });
    return `  (${[
      q(d.code), q(d.name), q(s.format),
      f ? num(f.techCap) : 'null', f ? num(f.evalCap) : 'null', f ? String(f.negativeClicks) : 'false',
      num(f?.deductions?.stop ?? 0), num(f?.deductions?.discard ?? 0), num(f?.deductions?.detach ?? 0),
      s.format === 'manual' ? num(s.max) : 'null', String(hasMusic(d)), String(i + 1),
      q(betterOf(s)), q(e.type), e.type === 'team' ? String(e.min) : 'null', e.type === 'team' ? String(e.max) : 'null',
      String(roundsOf(d).length), `${q(config)}::jsonb`,
    ].join(', ')})`;
  });
  const styles = c.divisions.flatMap((d) =>
    (d.styles?.options ?? []).map((o, i) => `  (${[q(d.code), q(o.code), q(o.label), num(o.multiplier ?? 1), String(i + 1)].join(', ')})`),
  );
  const codes = c.divisions.map((d) => q(d.code)).join(', ');
  const styleKeys = c.divisions.flatMap((d) => (d.styles?.options ?? []).map((o) => `(${q(d.code)}, ${q(o.code)})`));

  return `-- GENERATED by \`npm run divisions\` from contest.config.ts → competition.divisions.
-- Do not edit by hand. Apply it after the migrations, and again whenever divisions change:
--   Supabase → SQL Editor → paste this file → Run   (or: psql "$DATABASE_URL" -f supabase/divisions.sql)
-- It refuses to remove a division that registrations, scores or the run order still use.

begin;

insert into public.vsyc_divisions
  (code, name, scoring_format, tech_cap, eval_cap, allow_negative, stop_points, discard_points, detach_points, manual_max, has_music, sort_order,
   better, entry_type, team_min, team_max, rounds_count, config)
values
${rows.join(',\n')}
on conflict (code) do update set
  name = excluded.name, scoring_format = excluded.scoring_format, tech_cap = excluded.tech_cap,
  eval_cap = excluded.eval_cap, allow_negative = excluded.allow_negative, stop_points = excluded.stop_points,
  discard_points = excluded.discard_points, detach_points = excluded.detach_points,
  manual_max = excluded.manual_max, has_music = excluded.has_music, sort_order = excluded.sort_order,
  better = excluded.better, entry_type = excluded.entry_type, team_min = excluded.team_min,
  team_max = excluded.team_max, rounds_count = excluded.rounds_count, config = excluded.config,
  updated_at = now();

${styles.length ? `insert into public.vsyc_division_styles (division_code, code, label, multiplier, sort_order)
values
${styles.join(',\n')}
on conflict (division_code, code) do update set
  label = excluded.label, multiplier = excluded.multiplier, sort_order = excluded.sort_order;

delete from public.vsyc_division_styles
 where (division_code, code) not in (${styleKeys.join(', ')});` : 'delete from public.vsyc_division_styles;'}

delete from public.vsyc_divisions where code not in (${codes});

commit;
`;
}
