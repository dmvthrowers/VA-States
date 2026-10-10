// Stub for route tests (see ../route-harness.mjs): delegates to whatever the test registered under 'rate-limit'.
export const checkRateLimit = (...args) => { const impl = globalThis.__routeStubs?.get('rate-limit'); if (!impl || !impl.checkRateLimit) throw new Error('route test: no stub for rate-limit.checkRateLimit'); return impl.checkRateLimit(...args); };
export const getClientIp = (...args) => { const impl = globalThis.__routeStubs?.get('rate-limit'); if (!impl || !impl.getClientIp) throw new Error('route test: no stub for rate-limit.getClientIp'); return impl.getClientIp(...args); };
