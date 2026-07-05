import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { safeCompare } from '@/lib/tokens';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { pin } = body as { pin?: string };

  // Rate limit PIN attempts — 10 per IP per 15 minutes (brute-force guard)
  const ip = getClientIp(req.headers);
  const allowed = await checkRateLimit(ip, 'dj-pin', 10, 15);
  if (!allowed) {
    return NextResponse.json(
      { error: { message: 'Too many attempts. Try again later.' } },
      { status: 429, headers: { 'Retry-After': '900' } }
    );
  }

  const expected = process.env.DJ_PIN;

  if (!expected) {
    return NextResponse.json(
      { error: { message: 'DJ_PIN env var not set — contact server admin.' } },
      { status: 500 }
    );
  }

  if (!pin || !safeCompare(pin, expected)) {
    return NextResponse.json(
      { error: { message: 'Incorrect PIN.' } },
      { status: 401 }
    );
  }

  return NextResponse.json({ ok: true });
}
