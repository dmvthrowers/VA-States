import { competition, contest } from '@/contest.config';
import { computeFee, type FeeResult, type RegistrationSource } from './divisions-core';

export type { FeeResult, RegistrationSource } from './divisions-core';

/** A division code from contest.config.ts → competition.divisions */
export type Division = string;

/**
 * Server-side fee calculator. Prices, combos, early bird and walk-up amounts all come
 * from contest.config.ts → competition; the rules are in lib/divisions-core.ts.
 */
export function calculateFee(
  divisions: Division[],
  compDiscountPercent: number,
  registrationDate: Date,
  source: RegistrationSource,
  /** Team divisions where this registrant joins an existing team (per-team pricing makes them $0) */
  joining: Division[] = [],
): FeeResult {
  return computeFee(divisions, competition, compDiscountPercent, registrationDate, source, new Date(contest.deadlines.earlyBird), joining);
}

/** Client-side preview with an explicit early-bird cutoff. */
export function calculateFeePreview(
  divisions: Division[],
  compDiscountPercent: number,
  registrationDate: Date,
  source: RegistrationSource,
  earlyBirdCutoff: Date,
  joining: Division[] = [],
): FeeResult {
  return computeFee(divisions, competition, compDiscountPercent, registrationDate, source, earlyBirdCutoff, joining);
}

/** Dollar string for display: 3000 → "$30.00" */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * While competition.pricing.pricesTbd is true, published price lists (home page, fee
 * calculator, walk-up desk) read "TBD". Checkout amounts from calculateFee are unchanged.
 */
export const PRICES_TBD = competition.pricing.pricesTbd;

/** List-price display: "TBD" while PRICES_TBD, otherwise "$30.00". */
export function displayPrice(cents: number): string {
  return PRICES_TBD ? 'TBD' : formatCents(cents);
}
