import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';

const socialsSchema = z.object({
  instagram: z.string().trim().max(100).optional().or(z.literal('')),
  tiktok: z.string().trim().max(100).optional().or(z.literal('')),
  youtube: z.string().trim().max(100).optional().or(z.literal('')),
  other: z.string().trim().max(200).optional().or(z.literal('')),
}).strict();

const spectatorUpdateSchema = z.object({
  nickname: z.string().trim().max(50).optional().or(z.literal('')),
  state: z.string().trim().length(2).toUpperCase().optional(),
  photo_url: z.string().trim().url().max(500).optional().or(z.literal('')),
  bio: z.string().trim().max(1000).optional().or(z.literal('')),
  team: z.string().trim().max(100).optional().or(z.literal('')),
  club: z.string().trim().max(100).optional().or(z.literal('')),
  yoyo: z.string().trim().max(100).optional().or(z.literal('')),
  string: z.string().trim().max(100).optional().or(z.literal('')),
  counterweight: z.string().trim().max(100).optional().or(z.literal('')),
  socials: socialsSchema.optional(),
  is_public: z.boolean().optional(),
}).strict();

async function getAuthedUser(req: NextRequest, requestId: string): Promise<{ userId: string; email: string } | NextResponse> {
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
  if (error || !data.user?.email) {
    return apiError('unauthorized', 'Invalid session token', requestId);
  }

  return { userId: data.user.id, email: data.user.email.toLowerCase() };
}

async function getOrClaimSpectator(userId: string, email: string) {
  const supabase = createAdminClient();

  const { data: linked, error: linkedErr } = await supabase
    .from('vsyc_spectators')
    .select('id, created_at, first_name, last_name, nickname, email, state, photo_url, bio, team, club, yoyo, string, counterweight, socials, is_public')
    .eq('auth_user_id', userId)
    .single();

  if (!linkedErr && linked) {
    return linked;
  }

  const { data: candidate, error: candErr } = await supabase
    .from('vsyc_spectators')
    .select('id')
    .is('auth_user_id', null)
    .ilike('email', email)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (candErr || !candidate) {
    return null;
  }

  const { error: claimErr } = await supabase
    .from('vsyc_spectators')
    .update({ auth_user_id: userId })
    .eq('id', candidate.id)
    .is('auth_user_id', null);

  if (claimErr) {
    return null;
  }

  const { data: claimed, error: claimedErr } = await supabase
    .from('vsyc_spectators')
    .select('id, created_at, first_name, last_name, nickname, email, state, photo_url, bio, team, club, yoyo, string, counterweight, socials, is_public')
    .eq('id', candidate.id)
    .single();

  if (claimedErr || !claimed) {
    return null;
  }

  return claimed;
}

export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await getAuthedUser(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const spectator = await getOrClaimSpectator(auth.userId, auth.email);
  if (!spectator) {
    return apiError('not_found', 'No spectator RSVP found for this email', requestId);
  }

  return NextResponse.json(spectator, { headers: { 'x-request-id': requestId } });
});

export const PATCH = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await getAuthedUser(req, requestId);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = spectatorUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }

  const updates = parsed.data;
  if (Object.keys(updates).length === 0) {
    return apiError('bad_request', 'No fields to update', requestId);
  }

  const normalized = {
    ...updates,
    nickname: updates.nickname || null,
    photo_url: updates.photo_url || null,
    bio: updates.bio || null,
    team: updates.team || null,
    club: updates.club || null,
    yoyo: updates.yoyo || null,
    string: updates.string || null,
    counterweight: updates.counterweight || null,
    socials: updates.socials ?? {},
  };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('vsyc_spectators')
    .update(normalized)
    .eq('auth_user_id', auth.userId);

  if (error) {
    console.error('[spectator/me] update error:', error);
    return apiError('upstream_error', 'Could not save your RSVP changes right now', requestId);
  }

  return NextResponse.json({ ok: true }, { headers: { 'x-request-id': requestId } });
});
