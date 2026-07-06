import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const staffProfilePatchSchema = z.object({
  display_name: z.string().trim().min(1).max(100).optional(),
  pronouns: z.string().trim().max(30).optional().or(z.literal('')),
  bio: z.string().trim().max(1000).optional().or(z.literal('')),
  photo_url: z.string().trim().url().max(500).optional().or(z.literal('')),
  is_public_profile: z.boolean().optional(),
}).strict();

export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const token = getBearerToken(req);
  if (!token) {
    return apiError('unauthorized', 'Missing bearer token', requestId);
  }

  const identity = await getStaffIdentityFromToken(token);
  if (!identity || !identity.isActive) {
    return apiError('unauthorized', 'Staff access denied', requestId);
  }

  return NextResponse.json(
    {
      auth_user_id: identity.authUserId,
      email: identity.email,
      role: identity.role,
      display_name: identity.displayName,
      pronouns: identity.pronouns,
      bio: identity.bio,
      photo_url: identity.photoUrl,
      is_public_profile: identity.isPublicProfile,
      is_active: identity.isActive,
    },
    { headers: { 'x-request-id': requestId } }
  );
});

export const PATCH = withErrorHandling(async (requestId, req: NextRequest) => {
  const token = getBearerToken(req);
  if (!token) {
    return apiError('unauthorized', 'Missing bearer token', requestId);
  }

  const identity = await getStaffIdentityFromToken(token);
  if (!identity || !identity.isActive) {
    return apiError('unauthorized', 'Staff access denied', requestId);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = staffProfilePatchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }

  if (Object.keys(parsed.data).length === 0) {
    return apiError('bad_request', 'No fields to update', requestId);
  }

  const updates = {
    ...parsed.data,
    pronouns: parsed.data.pronouns || null,
    bio: parsed.data.bio || null,
    photo_url: parsed.data.photo_url || null,
  };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('vsyc_staff_accounts')
    .update(updates)
    .eq('auth_user_id', identity.authUserId);

  if (error) {
    return apiError('upstream_error', 'Could not save staff profile', requestId);
  }

  return NextResponse.json({ ok: true }, { headers: { 'x-request-id': requestId } });
});
