import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from './lib/sentry-options';

// Error reporting only: no tracing, no session replay, no personal
// data (see lib/sentry-options.ts).
// Does nothing until NEXT_PUBLIC_SENTRY_DSN is set.
export function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? 'development',
    ...sentryOptions,
  });
}

// Server-rendered pages, route handlers, and middleware errors that escape
// withErrorHandling.
export const onRequestError = Sentry.captureRequestError;
