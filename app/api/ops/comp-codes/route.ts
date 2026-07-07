import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';
import { logAudit } from '@/lib/audit';
import { z } from 'zod';

async function requireAdmin(req: NextRequest, requestId: string) {
  const token = getBearerToken(req);
  if (!token) return apiError('unauthorized', 'Missing bearer token', requestId);

  const identity = await getStaffIdentityFromToken(token);
  if (!identity || !identity.isActive || identity.role !== 'admin') {
    return apiError('forbidden', 'Admin access required', requestId);
  }

  return identity;
}

// Accepts either a plain YYYY-MM-DD (from the dashboard's <input type="date">)
// or a full ISO datetime with offset. Plain dates are normalized to end-of-day
// Eastern to match the table's own default (2026-09-12 23:59:59-04).
const expiresAtField = z.string().trim().refine(
  (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isNaN(Date.parse(v)),
  'Invalid date',
).transform((v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T23:59:59-04:00` : v));

const createCodeSchema = z.object({
  code: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/, 'Letters, numbers, dashes, and underscores only'),
  description: z.string().trim().min(1).max(200),
  discount_percent: z.number().int().min(1).max(100).default(100),
  max_uses: z.number().int().min(1).max(1000).default(1),
  expires_at: expiresAtField.optional(),
  active: z.boolean().optional(),
}).strict();

export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdmin(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('vsyc_comp_codes')
    .select('code, description, discount_percent, max_uses, uses_count, expires_at, active, created_at')
    .order('created_at', { ascending: false });

  if (error) return apiError('upstream_error', 'Failed to load comp codes', requestId);

  return NextResponse.json({ codes: data ?? [] }, { headers: { 'x-request-id': requestId } });
});

export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdmin(req, requestId);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = createCodeSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }

  const input = parsed.data;
  const code = input.code.toUpperCase();

  const supabase = createAdminClient();
  const insertRow: Record<string, unknown> = {
    code,
    description: input.description,
    discount_percent: input.discount_percent,
    max_uses: input.max_uses,
  };
  if (input.expires_at) insertRow.expires_at = input.expires_at;
  if (input.active !== undefined) insertRow.active = input.active;

  const { data, error } = await supabase
    .from('vsyc_comp_codes')
    .insert(insertRow)
    .select('code, description, discount_percent, max_uses, uses_count, expires_at, active, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      return apiError('conflict', `A comp code named "${code}" already exists.`, requestId);
    }
    return apiError('upstream_error', error.message, requestId);
  }

  await logAudit('created', {
    actor: `admin:${auth.email}`,
    details: { type: 'comp_code', code, discount_percent: input.discount_percent, max_uses: input.max_uses },
  });

  return NextResponse.json({ ok: true, code: data }, { status: 201, headers: { 'x-request-id': requestId } });
});
