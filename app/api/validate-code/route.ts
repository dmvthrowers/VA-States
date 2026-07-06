import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { isCodeLocked, recordFailedCodeAttempt } from '@/lib/comp-code-guard';
import { logAudit } from '@/lib/audit';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const ip = getClientIp(req.headers);
  const allowed = await checkRateLimit(ip, 'validate-code', 8, 15);
  if (!allowed) return apiError('rate_limited', 'Too many requests. Try again in a few minutes.', requestId);

  let body: unknown;
  try { body = await req.json(); } catch {
    return apiError('bad_request', 'Invalid JSON', requestId);
  }

  const code = typeof (body as Record<string, unknown>).code === 'string'
    ? ((body as Record<string, unknown>).code as string).trim().toUpperCase()
    : '';

  if (!code || code.length > 40) {
    return apiError('bad_request', 'Invalid code', requestId);
  }

  // Per-code lockout — stops a distributed attacker rotating IPs to guess
  // one specific code string, which the per-IP limiter above can't catch.
  if (await isCodeLocked(code)) {
    await logAudit('comp_code_locked_attempt', { actor: 'anonymous', details: { ip, code } });
    return NextResponse.json({ valid: false }, { headers: { 'x-request-id': requestId } });
  }

  const supabase = createAdminClient();
  const now = new Date();

  const { data, error } = await supabase
    .from('vsyc_comp_codes')
    .select('active, uses_count, max_uses, expires_at')
    .eq('code', code)
    .single();

  const valid = !error && data && data.active && data.uses_count < data.max_uses && new Date(data.expires_at) >= now;

  if (!valid) {
    await recordFailedCodeAttempt(code);
    await logAudit('comp_code_invalid_attempt', { actor: 'anonymous', details: { ip, code } });
  }

  return NextResponse.json(
    { valid: Boolean(valid) },
    { headers: { 'x-request-id': requestId } }
  );
});
