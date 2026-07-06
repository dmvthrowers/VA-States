import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';

const signupSchema = z.object({
  registration_id: z.string().uuid('Invalid registration ID'),
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password is too long'),
});

export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }

  const { registration_id, email, password } = parsed.data;
  const supabase = createAdminClient();

  const { data: reg, error: regErr } = await supabase
    .from('vsyc_registrations')
    .select('id, email, auth_user_id')
    .eq('id', registration_id)
    .single();

  if (regErr || !reg) {
    return apiError('not_found', 'Registration not found', requestId);
  }

  if (reg.email.toLowerCase() !== email) {
    return apiError('unauthorized', 'Email does not match that registration', requestId);
  }

  if (reg.auth_user_id) {
    return apiError('conflict', 'An account already exists for this registration. Please sign in.', requestId);
  }

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      role: 'competitor',
      registration_id,
    },
  });

  if (createErr || !created.user) {
    const message = (createErr?.message ?? '').toLowerCase();
    if (message.includes('already') || message.includes('exists')) {
      return apiError('conflict', 'An account with this email already exists. Please sign in.', requestId);
    }
    console.error('[player-auth/signup] createUser error:', createErr);
    return apiError('upstream_error', 'Could not create account right now. Please try again.', requestId);
  }

  const { error: linkErr } = await supabase
    .from('vsyc_registrations')
    .update({ auth_user_id: created.user.id })
    .eq('id', registration_id)
    .is('auth_user_id', null);

  if (linkErr) {
    console.error('[player-auth/signup] link error:', linkErr);
    await supabase.auth.admin.deleteUser(created.user.id).catch(() => {});
    return apiError('upstream_error', 'Could not link account to registration. Please try again.', requestId);
  }

  return NextResponse.json({ ok: true }, { headers: { 'x-request-id': requestId } });
});
