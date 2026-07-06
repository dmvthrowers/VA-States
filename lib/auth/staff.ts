import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type StaffRole = 'judge' | 'dj' | 'audio_tech' | 'admin';

export interface StaffIdentity {
  authUserId: string;
  email: string;
  role: StaffRole;
  displayName: string;
  isActive: boolean;
  pronouns: string | null;
  bio: string | null;
  photoUrl: string | null;
  isPublicProfile: boolean;
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
    .select('auth_user_id, role, display_name, is_active, pronouns, bio, photo_url, is_public_profile')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  if (staffErr || !staff) return null;

  return {
    authUserId: staff.auth_user_id,
    email: authData.user.email.toLowerCase(),
    role: staff.role as StaffRole,
    displayName: staff.display_name,
    isActive: Boolean(staff.is_active),
    pronouns: staff.pronouns ?? null,
    bio: staff.bio ?? null,
    photoUrl: staff.photo_url ?? null,
    isPublicProfile: Boolean(staff.is_public_profile),
  };
}
