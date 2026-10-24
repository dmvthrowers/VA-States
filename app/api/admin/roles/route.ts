import { NextRequest, NextResponse } from 'next/server';
import { z } from '@/lib/zod';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';
import { GRANTABLE_ROLES, ROLES, can, grantsFromLegacyRole, grantsFromRows, wouldRemoveLastAdmin, type AdminCheckRow } from '@/lib/roles';

/**
 * Staff and roles (docs/ROLES.md). Needs `staff.manage`, which only admin holds.
 *   GET    every staff account with the roles it holds, plus the roles that can be handed out
 *   POST   { auth_user_id, role, event_id? } grant a role
 *   DELETE { auth_user_id, role, event_id? } revoke a role (history is kept; the last admin can't be removed)
 */

const grantSchema = z.object({
  auth_user_id: z.string().guid(),
  role: z.string().min(1).max(30),
  event_id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,59}$/).nullish(),
}).strict();

async function requireStaffManager(req: NextRequest, requestId: string) {
  const token = getBearerToken(req);
  if (!token) return apiError('unauthorized', 'Missing bearer token', requestId);
  const identity = await getStaffIdentityFromToken(token);
  if (!identity || !identity.isActive || !can(identity.grants, 'staff.manage')) {
    return apiError('forbidden', 'Only an admin can change staff roles', requestId);
  }
  return identity;
}

async function readBody(req: NextRequest, requestId: string) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { error: apiError('bad_request', 'Invalid JSON body', requestId) };
  }
  const parsed = grantSchema.safeParse(body);
  if (!parsed.success) return { error: apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId) };
  return { data: parsed.data };
}

export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireStaffManager(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const supabase = createAdminClient();
  const [{ data: accounts, error: accErr }, { data: rows, error: rowErr }] = await Promise.all([
    supabase.from('vsyc_staff_accounts').select('auth_user_id, role, display_name, is_active').order('display_name'),
    supabase.from('vsyc_role_grants').select('auth_user_id, role, event_id, revoked_at'),
  ]);
  if (accErr) return apiError('upstream_error', 'Could not load staff accounts', requestId);

  const byUser = new Map<string, NonNullable<typeof rows>>();
  for (const r of rowErr ? [] : rows ?? []) byUser.set(r.auth_user_id, [...(byUser.get(r.auth_user_id) ?? []), r]);

  const staff = (accounts ?? []).map((a) => {
    const mine = byUser.get(a.auth_user_id) ?? [];
    // Same rule as sign-in: an account with no grant rows at all still runs on its legacy role.
    const grants = mine.length > 0 ? grantsFromRows(mine) : grantsFromLegacyRole(a.role);
    return { auth_user_id: a.auth_user_id, display_name: a.display_name, is_active: a.is_active, legacy_role: a.role, grants };
  });

  return NextResponse.json(
    { staff, roles: GRANTABLE_ROLES.map((id) => ({ id, label: ROLES[id].label, description: ROLES[id].description })) },
    { headers: { 'x-request-id': requestId, 'Cache-Control': 'no-store' } },
  );
});

export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireStaffManager(req, requestId);
  if (auth instanceof NextResponse) return auth;
  const body = await readBody(req, requestId);
  if (body.error) return body.error;
  const { auth_user_id, role } = body.data;
  const eventId = body.data.event_id ?? null;

  if (!(GRANTABLE_ROLES as string[]).includes(role)) {
    return apiError('bad_request', 'That role cannot be granted by hand', requestId);
  }

  const supabase = createAdminClient();
  const { data: account } = await supabase.from('vsyc_staff_accounts').select('auth_user_id, role').eq('auth_user_id', auth_user_id).maybeSingle();
  if (!account) return apiError('not_found', 'No staff account with that id', requestId);

  const { data: existing } = await supabase
    .from('vsyc_role_grants')
    .select('id, event_id')
    .eq('auth_user_id', auth_user_id)
    .eq('role', role)
    .is('revoked_at', null);
  if ((existing ?? []).some((g) => (g.event_id ?? null) === eventId)) {
    return NextResponse.json({ ok: true, unchanged: true }, { headers: { 'x-request-id': requestId } });
  }

  // An account that still runs on its legacy role gets that role written down first. Otherwise this first
  // grant would replace it (once an account has any grant row, the table alone decides).
  const { count } = await supabase.from('vsyc_role_grants').select('id', { count: 'exact', head: true }).eq('auth_user_id', auth_user_id);
  if ((count ?? 0) === 0 && account.role && account.role !== role) {
    const { error: legacyErr } = await supabase
      .from('vsyc_role_grants')
      .insert({ auth_user_id, role: account.role, granted_by: auth.authUserId });
    if (legacyErr) return apiError('upstream_error', 'Could not record the existing role before adding another', requestId);
  }

  const { error } = await supabase
    .from('vsyc_role_grants')
    .insert({ auth_user_id, role, event_id: eventId, granted_by: auth.authUserId });
  if (error) return apiError('upstream_error', 'Could not grant the role', requestId);

  console.info(`[admin/roles] ${auth.authUserId} granted ${role}${eventId ? ` (${eventId})` : ''} to ${auth_user_id}`);
  return NextResponse.json({ ok: true }, { headers: { 'x-request-id': requestId } });
});

export const DELETE = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireStaffManager(req, requestId);
  if (auth instanceof NextResponse) return auth;
  const body = await readBody(req, requestId);
  if (body.error) return body.error;
  const { auth_user_id, role } = body.data;
  const eventId = body.data.event_id ?? null;

  const supabase = createAdminClient();

  // Admin check needs everyone's rows, and accounts that still run on their legacy role count too.
  const [{ data: accounts }, { data: rows }] = await Promise.all([
    supabase.from('vsyc_staff_accounts').select('auth_user_id, role, is_active'),
    supabase.from('vsyc_role_grants').select('auth_user_id, role, event_id, revoked_at'),
  ]);
  const withRows = new Set((rows ?? []).map((r) => r.auth_user_id));
  const checkRows: AdminCheckRow[] = [
    ...(rows ?? []).map((r) => ({ ...r, is_active: (accounts ?? []).find((a) => a.auth_user_id === r.auth_user_id)?.is_active ?? false })),
    ...(accounts ?? []).filter((a) => !withRows.has(a.auth_user_id)).map((a) => ({ auth_user_id: a.auth_user_id, role: a.role, is_active: a.is_active })),
  ];
  if (wouldRemoveLastAdmin(checkRows, { auth_user_id, role, event_id: eventId })) {
    return apiError('conflict', 'That would leave nobody with admin access. Make someone else an admin first.', requestId);
  }

  // If this account still runs on its legacy role, write it down first so revoking one role keeps the rest.
  if (!withRows.has(auth_user_id)) {
    const legacy = (accounts ?? []).find((a) => a.auth_user_id === auth_user_id)?.role;
    if (legacy) {
      const { error: legacyErr } = await supabase.from('vsyc_role_grants').insert({ auth_user_id, role: legacy, granted_by: auth.authUserId });
      if (legacyErr) return apiError('upstream_error', 'Could not record the existing role before changing it', requestId);
    }
  }

  let q = supabase
    .from('vsyc_role_grants')
    .update({ revoked_at: new Date().toISOString(), revoked_by: auth.authUserId })
    .eq('auth_user_id', auth_user_id)
    .eq('role', role)
    .is('revoked_at', null);
  q = eventId ? q.eq('event_id', eventId) : q.is('event_id', null);
  const { data: done, error } = await q.select('id');
  if (error) return apiError('upstream_error', 'Could not revoke the role', requestId);
  if (!done || done.length === 0) return apiError('not_found', 'That account does not hold that role', requestId);

  console.info(`[admin/roles] ${auth.authUserId} revoked ${role}${eventId ? ` (${eventId})` : ''} from ${auth_user_id}`);
  return NextResponse.json({ ok: true }, { headers: { 'x-request-id': requestId } });
});
