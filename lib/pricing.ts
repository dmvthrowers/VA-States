export type Division = '1A' | 'X' | 'SBJ';
export type RegistrationSource = 'online' | 'late_email' | 'walk_up' | 'soft_launch';

const BASE_PRICE: Record<Division, number> = {
  '1A': 2500,
  'X':  2000,
  'SBJ': 1500,
};

export interface FeeResult {
  fee_cents: number;
  combo_applied: boolean;
  early_bird_applied: boolean;
  walk_up_surcharge: boolean;
  is_comp: boolean;
  comp_discount_percent: number;
  comp_base_fee_cents: number;
}

/**
 * Server-side fee calculator. Applies rules in the locked order:
 * 1. Comp code present → knocks the combo-adjusted fee down by its
 *    discount_percent (1-100). 100% = $0, skips Stripe entirely. Anything
 *    less still goes through Stripe checkout for the reduced amount. A comp
 *    code supersedes early-bird and walk-up modifiers rather than stacking
 *    with them.
 * 2. Combo discount (1A + X together = $40 instead of $45)
 * 3. Early bird (before EARLY_BIRD_CUTOFF_ISO) → -$5, floor at $0
 * 4. Walk-up / late-email → +$10
 */
export function calculateFee(
  divisions: Division[],
  compDiscountPercent: number,
  registrationDate: Date,
  source: RegistrationSource,
): FeeResult {
  const has1A  = divisions.includes('1A');
  const hasX   = divisions.includes('X');
  const hasSBJ = divisions.includes('SBJ');
  const combo_applied = has1A && hasX;

  const baseFee = combo_applied
    ? 4000 + (hasSBJ ? 1500 : 0)
    : divisions.reduce((sum, d) => sum + BASE_PRICE[d], 0);

  if (compDiscountPercent > 0) {
    const pct = Math.min(100, Math.max(0, compDiscountPercent));
    const fee = Math.round(baseFee * (100 - pct) / 100);
    return {
      fee_cents: fee,
      combo_applied,
      early_bird_applied: false,
      walk_up_surcharge: false,
      is_comp: fee === 0,
      comp_discount_percent: pct,
      comp_base_fee_cents: baseFee,
    };
  }

  let fee = baseFee;

  const cutoff = new Date(process.env.EARLY_BIRD_CUTOFF_ISO ?? '2026-06-01T00:00:00-04:00');
  const early_bird_applied = registrationDate < cutoff;
  if (early_bird_applied) fee = Math.max(0, fee - 500);

  const walk_up_surcharge = source === 'walk_up' || source === 'late_email';
  if (walk_up_surcharge) fee += 1000;

  return {
    fee_cents: fee,
    combo_applied,
    early_bird_applied,
    walk_up_surcharge,
    is_comp: false,
    comp_discount_percent: 0,
    comp_base_fee_cents: baseFee,
  };
}

/** Dollar string for display: 2500 → "$25.00" */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Client-side preview (no env vars available — caller passes cutoff). */
export function calculateFeePreview(
  divisions: Division[],
  compDiscountPercent: number,
  registrationDate: Date,
  source: RegistrationSource,
  earlyBirdCutoff: Date,
): FeeResult {
  const has1A  = divisions.includes('1A');
  const hasX   = divisions.includes('X');
  const hasSBJ = divisions.includes('SBJ');
  const combo_applied = has1A && hasX;

  const baseFee = combo_applied
    ? 4000 + (hasSBJ ? 1500 : 0)
    : divisions.reduce((sum, d) => sum + BASE_PRICE[d], 0);

  if (compDiscountPercent > 0) {
    const pct = Math.min(100, Math.max(0, compDiscountPercent));
    const fee = Math.round(baseFee * (100 - pct) / 100);
    return {
      fee_cents: fee,
      combo_applied,
      early_bird_applied: false,
      walk_up_surcharge: false,
      is_comp: fee === 0,
      comp_discount_percent: pct,
      comp_base_fee_cents: baseFee,
    };
  }

  let fee = baseFee;

  const early_bird_applied = registrationDate < earlyBirdCutoff;
  if (early_bird_applied) fee = Math.max(0, fee - 500);

  const walk_up_surcharge = source === 'walk_up' || source === 'late_email';
  if (walk_up_surcharge) fee += 1000;

  return {
    fee_cents: fee,
    combo_applied,
    early_bird_applied,
    walk_up_surcharge,
    is_comp: false,
    comp_discount_percent: 0,
    comp_base_fee_cents: baseFee,
  };
}
