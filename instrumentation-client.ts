import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from './lib/sentry-options';

// Browser errors only: no tracing, no session replay, no personal
// data (see lib/sentry-options.ts).
// Does nothing until NEXT_PUBLIC_SENTRY_DSN is set.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
    ...sentryOptions,
  });
}
