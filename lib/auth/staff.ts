import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { grantsFromLegacyRole, grantsFromRows, type RoleGrant } from '@/lib/roles';

export type StaffRole = 'judge' | 'dj' | 'audio_tech' | 'admin';

export interface StaffSocials {
  instagram?: string | null;
  tiktok?: string | null;
  youtube?: string | null;
}

export interface StaffIdentity {
  authUserId: string;
  email: string;
  /** The account's single legacy role. Old callers still read this; new code should use `grants` with `can()`. */
  role: StaffRole;
  /** Every role the account holds (live grants, or the legacy role when the grants table has none or isn't readable). */
  grants: RoleGrant[];
  displayName: string;
  isActive: boolean;
  pronouns: string | null;
  bio: string | null;
  photoUrl: string | null;
  isPublicProfile: boolean;
  socials: StaffSocials;
}

export function getBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

export async function getStaffIdentityFromToken(token: string): Promise<StaffIdentity | null> {
  const supabase = createAdminClient();

  const { data: authData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !authData.user?.email) return null;

  const { data: staff, error: staffErr } = await supabase
    .from('vsyc_staff_accounts')
    .select('auth_user_id, role, display_name, is_active, pronouns, bio, photo_url, is_public_profile, socials')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  if (staffErr || !staff) return null;

  // Grants table (migration 0063). The legacy role stands in only when the table can't be read (not applied
  // yet) or this account has never had a grant row, so nobody loses access during the move. Once an account
  // has any row, the table decides, including revoked rows: revoking someone's last role must not fall
  // back to the old column and quietly give it back.
  const { data: grantRows, error: grantErr } = await supabase
    .from('vsyc_role_grants')
    .select('role, event_id, revoked_at')
    .eq('auth_user_id', authData.user.id);
  const grants = grantErr || !grantRows || grantRows.length === 0
    ? grantsFromLegacyRole(staff.role)
    : grantsFromRows(grantRows);

  return {
    authUserId: staff.auth_user_id,
    email: authData.user.email.toLowerCase(),
    role: staff.role as StaffRole,
    grants,
    displayName: staff.display_name,
    isActive: Boolean(staff.is_active),
    pronouns: staff.pronouns ?? null,
    bio: staff.bio ?? null,
    photoUrl: staff.photo_url ?? null,
    isPublicProfile: Boolean(staff.is_public_profile),
    socials: (staff.socials as StaffSocials) ?? {},
  };
}
