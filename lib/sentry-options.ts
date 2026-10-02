import type { init } from '@sentry/nextjs';

// Shared Sentry settings for the browser and server. Errors only: no
// tracing, no replay. Registrations hold emails, minors' details, payment
// records and portal tokens, so send stack traces and nothing else: no user
// info, cookies, headers, query strings, request bodies or local variables.
export const sentryOptions: Pick<NonNullable<Parameters<typeof init>[0]>, 'dataCollection'> = {
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    databaseQueryData: false,
    queues: false,
    stackFrameVariables: false,
  },
};
