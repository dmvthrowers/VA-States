// Stub for route tests (see ../route-harness.mjs): delegates to whatever the test registered under 'email'.
export const sendConfirmationEmail = (...args) => { const impl = globalThis.__routeStubs?.get('email'); if (!impl || !impl.sendConfirmationEmail) throw new Error('route test: no stub for email.sendConfirmationEmail'); return impl.sendConfirmationEmail(...args); };
