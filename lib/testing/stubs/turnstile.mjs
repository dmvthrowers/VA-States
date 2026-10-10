// Stub for route tests (see ../route-harness.mjs): delegates to whatever the test registered under 'turnstile'.
export const verifyTurnstile = (...args) => { const impl = globalThis.__routeStubs?.get('turnstile'); if (!impl || !impl.verifyTurnstile) throw new Error('route test: no stub for turnstile.verifyTurnstile'); return impl.verifyTurnstile(...args); };
