/**
 * Cloudflare Turnstile server-side check for public write forms.
 *
 * Off until TURNSTILE_SECRET_KEY is set (pair it with
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY so the widget renders). A missing or
 * rejected token fails closed; a Cloudflare outage fails open, the same way
 * rate limiting does, so a provider incident can't block submissions. The
 * per-IP rate limits still apply either way.
 */
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(token: unknown, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return false;

  const form = new URLSearchParams({ secret, response: token });
  if (ip !== 'unknown') form.set('remoteip', ip);

  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error(`[turnstile] siteverify returned ${res.status}; allowing request`);
      return true;
    }
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (e) {
    console.error('[turnstile] siteverify unreachable; allowing request:', e);
    return true;
  }
}

/**
 * A copy of a request body without its `turnstileToken`. For forms whose own schema is strict (the
 * sponsor inquiry, the forms engine): the token is not one of their answers and would be refused.
 */
export function withoutTurnstileToken(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const { turnstileToken: _token, ...rest } = body as Record<string, unknown>;
  void _token;
  return rest;
}
