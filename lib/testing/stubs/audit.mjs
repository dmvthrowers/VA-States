// Stub for route tests (see ../route-harness.mjs): delegates to whatever the test registered under 'audit'.
export const logAudit = (...args) => { const impl = globalThis.__routeStubs?.get('audit'); if (!impl || !impl.logAudit) throw new Error('route test: no stub for audit.logAudit'); return impl.logAudit(...args); };
