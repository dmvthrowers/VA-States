/**
 * Which rounds a division runs, decided by how many entered. The division lists all the rounds it
 * could have (`rounds`) and a `roundPlan` of tiers; this picks the tier for an entrant count and
 * answers "is this round running?", "who advances from it?" and "what comes next?".
 *
 * Pure, so it's tested without a database. Skipped rounds keep their numbers (a Final-only
 * division still scores round 3), so music tracks, scores and run orders never need renumbering.
 */
import type { DivisionDef, RoundTier } from '@/contest.config';
import { roundKey, roundsOf } from '@/lib/divisions-core';

/** A confirmed plan, as stored: the entrant count it was made for and the rounds that run. */
export interface RoundPlan {
  entrants: number;
  /** Index of the tier in `roundPlan` this came from */
  tier: number;
  rounds: { round: number; key: string; advance: number | null }[];
}

/** Index of the tier for `count` entrants, or null when the division has no plan. */
export function tierIndexFor(tiers: RoundTier[] | undefined, count: number): number | null {
  if (!tiers?.length) return null;
  const i = tiers.findIndex((t) => t.upTo === undefined || count <= t.upTo);
  return i === -1 ? tiers.length - 1 : i;
}

/** The plan a tier gives: its rounds in order, numbered by their place in the division's rounds. */
export function planFromTier(def: DivisionDef, tierIndex: number, entrants: number): RoundPlan | null {
  const tier = def.roundPlan?.[tierIndex];
  if (!tier) return null;
  const all = roundsOf(def);
  const keys = all.map((r, i) => roundKey(r, i));
  const rounds = tier.rounds
    .map((t) => ({ round: keys.indexOf(t.key) + 1, key: t.key, advance: t.advance ?? null }))
    .filter((r) => r.round > 0)
    .sort((a, b) => a.round - b.round);
  return { entrants, tier: tierIndex, rounds };
}

/** The suggested plan for an entrant count, or null when the division has no `roundPlan`. */
export function suggestPlan(def: DivisionDef, entrants: number): RoundPlan | null {
  const i = tierIndexFor(def.roundPlan, entrants);
  return i === null ? null : planFromTier(def, i, entrants);
}

/** Does this round run? Always true until a plan is confirmed or when the division has none. */
export function isRoundActive(def: DivisionDef | undefined, plan: RoundPlan | null | undefined, round: number): boolean {
  if (!def?.roundPlan?.length || !plan) return round >= 1 && round <= roundsOf(def).length;
  return plan.rounds.some((r) => r.round === round);
}

/** The round numbers that run, in order. */
export function activeRounds(def: DivisionDef | undefined, plan: RoundPlan | null | undefined): number[] {
  if (!def?.roundPlan?.length || !plan) return roundsOf(def).map((_, i) => i + 1);
  return plan.rounds.map((r) => r.round);
}

/** The round after `from` that runs, or null when `from` is the last one. */
export function nextActiveRound(def: DivisionDef | undefined, plan: RoundPlan | null | undefined, from: number): number | null {
  return activeRounds(def, plan).find((n) => n > from) ?? null;
}

/**
 * How many advance from a round: the confirmed plan's count, else the round's own `advance`.
 * null for the last round that runs.
 */
export function advanceCount(def: DivisionDef | undefined, plan: RoundPlan | null | undefined, round: number): number | null {
  if (def?.roundPlan?.length && plan) {
    const r = plan.rounds.find((x) => x.round === round);
    if (!r || nextActiveRound(def, plan, round) === null) return null;
    return r.advance;
  }
  return roundsOf(def)[round - 1]?.advance ?? null;
}

export interface CutCandidate { registration_id: string; value: number }

/**
 * The cut at the advance count. `clear` are in for certain; `tied` all share the score at the
 * cutoff and don't all fit, so the organizer decides (take them all, or pick). `outside` didn't
 * make it. With no tie at the cut, `tied` is empty and `clear` is exactly the top `count`.
 * `ranked` must be best first.
 */
export function cutAt<T extends CutCandidate>(ranked: T[], count: number): { clear: T[]; tied: T[]; outside: T[]; slots: number } {
  if (count <= 0) return { clear: [], tied: [], outside: [...ranked], slots: 0 };
  if (ranked.length <= count) return { clear: [...ranked], tied: [], outside: [], slots: 0 };
  const cut = ranked[count - 1].value;
  const atCut = ranked.filter((r) => r.value === cut);
  if (atCut.length === 1 || ranked[count].value !== cut) {
    return { clear: ranked.slice(0, count), tied: [], outside: ranked.slice(count), slots: 0 };
  }
  const firstTied = ranked.findIndex((r) => r.value === cut);
  return {
    clear: ranked.slice(0, firstTied),
    tied: atCut,
    outside: ranked.filter((r) => r.value !== cut).slice(firstTied),
    slots: count - firstTied,
  };
}

/** Problems with a division's `roundPlan` (empty is fine). */
export function roundPlanIssues(d: DivisionDef): string[] {
  const out: string[] = [];
  if (!d.roundPlan) return out;
  if (!d.rounds?.length) return [`${d.code}: roundPlan needs the division to have rounds`];
  const keys = roundsOf(d).map((r, i) => roundKey(r, i));
  let prev = 0;
  d.roundPlan.forEach((t, i) => {
    if (t.upTo !== undefined) {
      if (!Number.isInteger(t.upTo) || t.upTo < 1) out.push(`${d.code}: roundPlan tier ${i + 1} upTo must be a whole number ≥ 1`);
      if (t.upTo <= prev) out.push(`${d.code}: roundPlan tiers must have increasing upTo`);
      prev = t.upTo;
    } else if (i !== d.roundPlan!.length - 1) out.push(`${d.code}: only the last roundPlan tier may leave out upTo`);
    if (t.rounds.length === 0) out.push(`${d.code}: roundPlan tier ${i + 1} runs no rounds`);
    let last = 0;
    t.rounds.forEach((r, j) => {
      const at = keys.indexOf(r.key);
      if (at === -1) out.push(`${d.code}: roundPlan tier ${i + 1} names unknown round "${r.key}"`);
      else if (at + 1 <= last) out.push(`${d.code}: roundPlan tier ${i + 1} lists rounds out of order`);
      else last = at + 1;
      const isLast = j === t.rounds.length - 1;
      if (isLast && r.advance !== undefined) out.push(`${d.code}: roundPlan tier ${i + 1}: the last round can't advance anyone`);
      if (!isLast && !(r.advance && r.advance > 0)) out.push(`${d.code}: roundPlan tier ${i + 1}: "${r.key}" needs an advance count`);
    });
  });
  if (d.roundPlan[d.roundPlan.length - 1].upTo !== undefined) out.push(`${d.code}: the last roundPlan tier should leave out upTo`);
  return out;
}

/**
 * Plain-English summary for players and the rules page, e.g. "25 or fewer: final only (3:00).
 * 26–50: prelims (1:00, top 15 advance), then final (3:00)."
 */
export function describeRoundPlan(def: DivisionDef): string[] {
  const tiers = def.roundPlan;
  if (!tiers?.length) return [];
  const all = roundsOf(def);
  const keys = all.map((r, i) => roundKey(r, i));
  const time = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '');
  let from = 1;
  return tiers.map((t) => {
    const range = t.upTo === undefined ? `More than ${from - 1}` : t.upTo < from ? `${from}` : from === 1 ? `${t.upTo} or fewer` : `${from}–${t.upTo}`;
    if (t.upTo !== undefined) from = t.upTo + 1;
    const parts = t.rounds.map((r) => {
      const rd = all[keys.indexOf(r.key)];
      const len = time(rd?.seconds ?? def.routineSeconds);
      const detail = [len, r.advance ? `top ${r.advance} advance` : ''].filter(Boolean).join(', ');
      return { name: (rd?.name ?? r.key).toLowerCase(), detail: detail ? ` (${detail})` : '' };
    });
    const text = parts.length === 1
      ? `${parts[0].name} only${parts[0].detail}`
      : parts.map((x) => x.name + x.detail).join(', then ');
    return `${range}: ${text}.`;
  });
}

/** The rounds to show as tabs: the ones that run, with the advance count the plan sets. */
export function roundTabs(def: DivisionDef | undefined, plan: RoundPlan | null | undefined): { round: number; name: string; advance: number | null }[] {
  if (!def) return [];
  const all = roundsOf(def);
  return activeRounds(def, plan).map((n) => ({ round: n, name: all[n - 1].name, advance: advanceCount(def, plan, n) }));
}
