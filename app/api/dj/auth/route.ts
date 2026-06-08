import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { pin } = body as { pin?: string };

  const expected = process.env.DJ_PIN;

  if (!expected) {
    return NextResponse.json(
      { error: { message: 'DJ_PIN env var not set — contact server admin.' } },
      { status: 500 }
    );
  }

  if (!pin || pin !== expected) {
    // Constant-time comparison would be ideal; for a PIN this is fine
    return NextResponse.json(
      { error: { message: 'Incorrect PIN.' } },
      { status: 401 }
    );
  }

  return NextResponse.json({ ok: true });
}
