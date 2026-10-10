/**
 * Create the first admin, once (docs/SETUP.md step 6; master plan E9). No default password: it makes the
 * account, then prints a one-time link to set your own. If an admin already exists it changes nothing.
 *
 *   npm run first-admin -- --email you@example.org --name "Your Name" [--dry-run]
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (from .env.local or the environment).
 * Run it from your own machine; the service key never leaves it.
 */
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { firstAdminDecision, parseFirstAdminArgs } from '@/lib/first-admin';

async function main() {
  const parsed = parseFirstAdminArgs(process.argv.slice(2));
  if (!parsed.ok) throw new Error(parsed.error);
  const { email, name, dryRun } = parsed.args;
  if (!hasAdminCredentials()) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (see docs/SETUP.md).');

  const db = createAdminClient();
  const [accounts, grants] = await Promise.all([
    db.from('vsyc_staff_accounts').select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('is_active', true),
    // The grants table arrives with migration 0044; if it isn't there yet, only accounts count.
    db.from('vsyc_role_grants').select('id', { count: 'exact', head: true }).eq('role', 'admin').is('revoked_at', null),
  ]);
  if (accounts.error) throw new Error(`Could not read staff accounts: ${accounts.error.message}. Have the migrations been applied?`);
  const decision = firstAdminDecision({ activeAdminAccounts: accounts.count ?? 0, activeAdminGrants: grants.error ? 0 : grants.count ?? 0 });
  if (!decision.allowed) {
    console.log(decision.reason);
    return;
  }
  if (dryRun) {
    console.log(`No admin exists yet. Would create ${email} as admin "${name}". Nothing was changed (--dry-run).`);
    return;
  }

  const created = await db.auth.admin.createUser({ email, email_confirm: true });
  if (created.error || !created.data.user) {
    throw new Error(`Could not create the sign-in for ${email}: ${created.error?.message ?? 'unknown error'}. If it already exists, delete it under Supabase → Authentication → Users and run this again.`);
  }
  const userId = created.data.user.id;

  const staff = await db.from('vsyc_staff_accounts').insert({ auth_user_id: userId, role: 'admin', display_name: name });
  if (staff.error) {
    await db.auth.admin.deleteUser(userId); // undo, so a rerun starts clean
    throw new Error(`Could not save the admin account: ${staff.error.message}`);
  }

  const link = await db.auth.admin.generateLink({ type: 'recovery', email });
  console.log(`Admin created: ${name} <${email}>.`);
  if (link.error || !link.data.properties?.action_link) {
    console.log('Could not make a password link. Use "Forgot password" on the sign-in page to set one.');
  } else {
    console.log('Open this link once to set your password (it expires, and anyone with it can sign in as you):');
    console.log(link.data.properties.action_link);
  }
  console.log('Then sign in at /admin-dashboard. Running this again does nothing.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
