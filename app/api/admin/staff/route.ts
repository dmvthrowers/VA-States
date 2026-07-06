import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminRequest } from '@/lib/auth/admin-request';
import { z } from 'zod';

const createStaffSchema = z.object({
  email: z.string().trim().email().max(320),
  display_name: z.string().trim().min(1).max(100),
  role: z.enum(['judge', 'dj', 'audio_tech', 'admin']),
  password: z.string().min(8).max(128).optional().or(z.literal('')),
  is_active: z.boolean().optional(),
  is_public_profile: z.boolean().optional(),
}).strict();

function generateTemporaryPassword(length = 16): string {
  return randomBytes(length).toString('base64url').slice(0, length);
}

export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = createStaffSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }

  const email = parsed.data.email.toLowerCase();
  const displayName = parsed.data.display_name;
  const role = parsed.data.role;
  const isActive = parsed.data.is_active ?? true;
  const isPublicProfile = parsed.data.is_public_profile ?? false;
  const password = parsed.data.password?.trim() || generateTemporaryPassword();
  const generatedPassword = !parsed.data.password?.trim();

  const supabase = createAdminClient();
  const { data: userData, error: createUserError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName, role },
  });

  if (createUserError || !userData.user) {
    const message = createUserError?.message ?? 'Could not create staff account';
    const code = /already|duplicate/i.test(message) ? 'conflict' : 'upstream_error';
    return apiError(code, message, requestId);
  }

  const { error: staffError } = await supabase
    .from('vsyc_staff_accounts')
    .insert({
      auth_user_id: userData.user.id,
      role,
      display_name: displayName,
      is_active: isActive,
      is_public_profile: isPublicProfile,
    });

  if (staffError) {
    await supabase.auth.admin.deleteUser(userData.user.id);
    return apiError('upstream_error', 'Created auth account, but could not save staff record', requestId);
  }

  return NextResponse.json(
    {
      ok: true,
      staff: {
        auth_user_id: userData.user.id,
        email,
        display_name: displayName,
        role,
        is_active: isActive,
        is_public_profile: isPublicProfile,
      },
      temporary_password: generatedPassword ? password : undefined,
    },
    { headers: { 'x-request-id': requestId } }
  );
});