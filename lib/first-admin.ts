/**
 * First admin, once (master plan E9). The decision and the argument checks, pure so they are tested without
 * a database. scripts/first-admin.ts does the work; this file decides whether it may.
 */

export interface FirstAdminArgs { email: string; name: string; dryRun: boolean }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** `--email you@example.org --name "Your Name" [--dry-run]` → args, or a message saying what is wrong. */
export function parseFirstAdminArgs(argv: string[]): { ok: true; args: FirstAdminArgs } | { ok: false; error: string } {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const email = (get('--email') ?? '').trim().toLowerCase();
  const name = (get('--name') ?? '').trim();
  if (!EMAIL.test(email)) return { ok: false, error: 'Pass --email you@example.org' };
  if (name.length < 1 || name.length > 80) return { ok: false, error: 'Pass --name "Your Name" (1–80 characters)' };
  return { ok: true, args: { email, name, dryRun: argv.includes('--dry-run') } };
}

export type FirstAdminDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * May the first admin be created? Only when no admin exists in either place an admin can live: an active
 * staff account with the admin role, or an unrevoked admin grant.
 */
export function firstAdminDecision(existing: { activeAdminAccounts: number; activeAdminGrants: number }): FirstAdminDecision {
  if (existing.activeAdminAccounts > 0 || existing.activeAdminGrants > 0) {
    return {
      allowed: false,
      reason: 'An admin already exists, so this step does nothing. Sign in at /admin-dashboard, or add more staff from the admin screens.',
    };
  }
  return { allowed: true };
}
