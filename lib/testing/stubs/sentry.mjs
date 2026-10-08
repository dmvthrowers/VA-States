// Stub for @sentry/nextjs in route tests: errors are not reported.
export const captureException = () => {};
export const captureMessage = () => {};
export const withScope = (fn) => fn({ setTag() {}, setContext() {} });
