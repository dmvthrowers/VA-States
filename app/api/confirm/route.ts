import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { contest, competition } from '@/contest.config';
import { fetchRegistrationTeams, type TeamSummary } from '@/lib/team-entries';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

/** j***@gmail.com: enough to recognise the address, not enough to harvest it. */
function maskEmail(email: string | null): string {
  if (!email || !email.includes('@')) return '';
  const [name, domain] = email.split('@');
  return `${name.slice(0, 1)}***@${domain}`;
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ message: 'Missing id' }, { status: 400 });

  // The id is a random UUID, but the link never expires, so keep guessing and scraping slow.
  const allowed = await checkRateLimit(getClientIp(req.headers), 'confirm', 60, 60);
  if (!allowed) return NextResponse.json({ message: 'Too many requests. Try again in a few minutes.' }, { status: 429 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('vsyc_registrations')
    .select('id, first_name, last_name, email, divisions, division_styles, fee_cents, music_upload_token, music_uploaded_at, paid')
    .eq('id', id)
    .single();

  if (error || !data) return NextResponse.json({ message: 'Registration not found' }, { status: 404 });

  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://register.dmvthrowers.club';
  const musicDeadline = new Date(contest.deadlines.musicUpload);
  // No upload link once the music deadline has passed, so a leaked confirm link can't hand out the token.
  const canUploadMusic = (data.paid || data.fee_cents === 0) && Date.now() <= musicDeadline.getTime();

  // Teams they're on, with the join code to share (best-effort: the page still works without it).
  let teams: TeamSummary[] = [];
  try {
    teams = await fetchRegistrationTeams(supabase, data.id, competition);
  } catch (e) {
    console.error('[confirm] teams lookup failed:', e);
  }

  return NextResponse.json({
    id: data.id,
    first_name: data.first_name,
    last_name: data.last_name,
    email: maskEmail(data.email),
    divisions: data.divisions,
    division_styles: data.division_styles ?? {},
    fee_cents: data.fee_cents,
    paid: data.paid,
    music_upload_url: canUploadMusic ? `${BASE_URL}/upload?token=${data.music_upload_token}` : null,
    music_deadline: musicDeadline.toISOString(),
    teams,
  });
}
