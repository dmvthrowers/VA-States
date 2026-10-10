// Stub for route tests (see ../route-harness.mjs): delegates to whatever the test registered under 'stripe'.
export const getStripe = (...args) => { const impl = globalThis.__routeStubs?.get('stripe'); if (!impl || !impl.getStripe) throw new Error('route test: no stub for stripe.getStripe'); return impl.getStripe(...args); };
export const hasStripeCredentials = (...args) => { const impl = globalThis.__routeStubs?.get('stripe'); if (!impl || !impl.hasStripeCredentials) throw new Error('route test: no stub for stripe.hasStripeCredentials'); return impl.hasStripeCredentials(...args); };
