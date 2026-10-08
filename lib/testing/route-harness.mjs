// Route-level test harness (build plan 4.19): imports a real API route under plain Node, with the `@/` alias
// resolved and the modules that need a network or database swapped for stubs the test controls.
//
//   import { loadRoute, stubs } from './route-harness.mjs';
//   const { POST } = await loadRoute('app/api/webhooks/stripe/route.ts');
//   stubs.set('stripe', { hasStripeCredentials: () => true, getStripe: () => fake });
//
// Stubs are looked up by name at call time, so a test can change behavior between calls. Add a module to STUBBED
// below (and a file in ./stubs/) when a route needs another one.
import { register } from 'node:module';

const root = new URL('../../', import.meta.url).href;
const stubDir = new URL('./stubs/', import.meta.url).href;

/** `@/` specifier → stub file name (without .mjs) */
export const STUBBED = {
  '@/lib/stripe': 'stripe',
  '@/lib/supabase/admin': 'supabase-admin',
  '@/lib/audit': 'audit',
  '@/lib/payments': 'payments',
  '@/lib/stripe-dispute-server': 'stripe-dispute-server',
  '@/lib/rate-limit': 'rate-limit',
  '@/lib/turnstile': 'turnstile',
  '@/lib/event-flags': 'event-flags',
  '@/lib/comp-code-guard': 'comp-code-guard',
  '@/lib/email': 'email',
  '@/lib/team-entries': 'team-entries',
  '@/lib/auth/staff': 'auth-staff',
  '@sentry/nextjs': 'sentry',
};

const hook = `
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const ROOT = ${JSON.stringify(root)};
const STUBS = ${JSON.stringify(STUBBED)};
const STUB_DIR = ${JSON.stringify(stubDir)};
export async function resolve(spec, ctx, next) {
  // next has no ESM exports map for its subpaths, so point them at the files.
  if (spec === 'next/server') return { url: new URL('next-server.mjs', STUB_DIR).href, shortCircuit: true };
  if (STUBS[spec]) return { url: new URL(STUBS[spec] + '.mjs', STUB_DIR).href, shortCircuit: true };
  if (spec.startsWith('@/')) {
    for (const ext of ['', '.ts', '.tsx', '/index.ts']) {
      const url = new URL(spec.slice(2) + ext, ROOT);
      if (existsSync(fileURLToPath(url)) && !url.pathname.endsWith('/')) return { url: url.href, shortCircuit: true };
    }
  }
  // Relative imports between .ts files leave the extension off.
  if (spec.startsWith('.') && ctx.parentURL && /\\.tsx?$/.test(ctx.parentURL)) {
    for (const ext of ['.ts', '.tsx', '/index.ts']) {
      const url = new URL(spec + ext, ctx.parentURL);
      if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
    }
  }
  return next(spec, ctx);
}
`;
register(`data:text/javascript,${encodeURIComponent(hook)}`);

/** name → implementation object the stub module delegates to */
const registry = new Map();
globalThis.__routeStubs = registry;
export const stubs = {
  set(name, impl) { registry.set(name, impl); },
  reset() { registry.clear(); },
  get(name) { return registry.get(name); },
};

export async function loadRoute(path) {
  return import(new URL(path, root).href);
}
