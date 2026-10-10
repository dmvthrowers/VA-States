// Stub for route tests (see ../route-harness.mjs): delegates to whatever the test registered under 'payments'.
export const applyPaidSession = (...args) => { const impl = globalThis.__routeStubs?.get('payments'); if (!impl || !impl.applyPaidSession) throw new Error('route test: no stub for payments.applyPaidSession'); return impl.applyPaidSession(...args); };
