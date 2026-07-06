import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';

const profileUpdateSchema = z.object({
  preferred_bracket_name: z.string().trim().max(50).optional().or(z.literal('')),
  pronouns: z.string().trim().max(30).optional().or(z.literal('')),
  phone: z.string().trim().min(7).max(20).regex(/^[\d\s\-+().]+$/, 'Invalid phone number').optional(),
  city: z.string().trim().min(1).max(100).optional(),
  state: z.string().trim().length(2).toUpperCase().optional(),
  club_affiliation: z.string().trim().max(100).optional().or(z.literal('')),
  parent_name: z.string().trim().max(100).optional().or(z.literal('')),
  parent_email: z.string().trim().email().toLowerCase().optional().or(z.literal('')),
  emergency_contact_name: z.string().trim().max(100).optional().or(z.literal('')),
  emergency_contact_phone: z.string().trim().max(20).optional().or(z.literal('')),
  accessibility_needs: z.string().trim().max(500).optional().or(z.literal('')),
  performance_time_pref: z.enum(['no_pref', 'early', 'late', 'conflict']).optional().or(z.literal('')),
  scheduling_notes: z.string().trim().max(300).optional().or(z.literal('')),
  volunteer_interest: z.boolean().optional(),
}).strict();

async function getAuthedUserId(req: NextRequest, requestId: string): Promise<{ userId: string } | NextResponse> {
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return apiError('unauthorized', 'Missing bearer token', requestId);
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return apiError('unauthorized', 'Missing bearer token', requestId);
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return apiError('unauthorized', 'Invalid session token', requestId);
  }

  return { userId: data.user.id };
}

export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await getAuthedUserId(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const supabase = createAdminClient();
  const { data: reg, error } = await supabase
    .from('vsyc_registrations')
    .select('id, first_name, last_name, email, age_on_event, preferred_bracket_name, pronouns, phone, city, state, club_affiliation, parent_name, parent_email, parent_consented, divisions, x_substyle, emergency_contact_name, emergency_contact_phone, accessibility_needs, performance_time_pref, scheduling_notes, volunteer_interest, paid, fee_cents, music_upload_token, music_uploaded_at, music_filename')
    .eq('auth_user_id', auth.userId)
    .single();

  if (error || !reg) {
    return apiError('not_found', 'No linked registration found for this account', requestId);
  }

  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://register.dmvthrowers.club';
  const canUploadMusic = reg.paid || reg.fee_cents === 0;

  return NextResponse.json(
    {
      ...reg,
      can_upload_music: canUploadMusic,
      music_upload_url: canUploadMusic ? `${BASE_URL}/upload?token=${reg.music_upload_token}` : null,
    },
    { headers: { 'x-request-id': requestId } }
  );
});

export const PATCH = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await getAuthedUserId(req, requestId);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }

  const updates = parsed.data;
  if (Object.keys(updates).length === 0) {
    return apiError('bad_request', 'No fields to update', requestId);
  }

  const normalized = {
    ...updates,
    preferred_bracket_name: updates.preferred_bracket_name || null,
    pronouns: updates.pronouns || null,
    club_affiliation: updates.club_affiliation || null,
    parent_name: updates.parent_name || null,
    parent_email: updates.parent_email || null,
    emergency_contact_name: updates.emergency_contact_name || null,
    emergency_contact_phone: updates.emergency_contact_phone || null,
    accessibility_needs: updates.accessibility_needs || null,
    performance_time_pref: updates.performance_time_pref || null,
    scheduling_notes: updates.scheduling_notes || null,
  };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('vsyc_registrations')
    .update(normalized)
    .eq('auth_user_id', auth.userId);

  if (error) {
    console.error('[player/me] update error:', error);
    return apiError('upstream_error', 'Could not save your changes right now', requestId);
  }

  return NextResponse.json({ ok: true }, { headers: { 'x-request-id': requestId } });
});
