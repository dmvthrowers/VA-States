// Stub for route tests (see ../route-harness.mjs): delegates to whatever the test registered under 'event-flags'.
export const getEventFlagBoolean = (...args) => { const impl = globalThis.__routeStubs?.get('event-flags'); if (!impl || !impl.getEventFlagBoolean) throw new Error('route test: no stub for event-flags.getEventFlagBoolean'); return impl.getEventFlagBoolean(...args); };
