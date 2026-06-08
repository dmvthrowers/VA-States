import Stripe from 'stripe';

let cached: Stripe | null = null;

export function hasStripeCredentials(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Server-only Stripe client. NEVER import in a client component.
 * Uses the account's default API version (no pin needed).
 */
export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY not configured');
  }
  if (!cached) {
    cached = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return cached;
}
