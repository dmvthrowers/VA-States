import Stripe from 'stripe';

let cached: Stripe | null = null;

export function hasStripeCredentials(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * The Stripe API version every call uses. stripe-node pins one per release and sends it on every request
 * (stripe 17.7 sent this one), so upgrading the package would otherwise move the live app to a new API version
 * without anyone deciding to. Move it on purpose: test-mode checkout, webhook and refund first, then change it here.
 * The SDK's types describe its own newer version, hence the cast.
 */
const STRIPE_API_VERSION = '2025-02-24.acacia' as Stripe.LatestApiVersion;

/** Server-only Stripe client. NEVER import in a client component. */
export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY not configured');
  }
  if (!cached) {
    cached = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
  }
  return cached;
}
