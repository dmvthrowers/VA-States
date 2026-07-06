import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminRequest } from '@/lib/auth/admin-request';
import { logAudit } from '@/lib/audit';

const createCodeSchema = z.object({
  code: z.string().trim().min(3).max(40),
  description: z.string().trim().max(200).optional().or(z.literal('')),
  max_uses: z.number().int().min(1).max(1000).optional(),
  discount_percent: z.number().int().min(1).max(100).optional(),
  expires_at: z.string().trim().min(1),
  active: z.boolean().optional(),
}).strict();

const toggleCodeSchema = z.object({
  code: z.string().trim().min(3).max(40),
  active: z.boolean(),
}).strict();

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('vsyc_comp_codes')
    .select('code, description, max_uses, uses_count, expires_at, active, discount_percent, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return apiError('upstream_error', error.message, requestId);
  }

  return NextResponse.json(
    { ok: true, codes: data ?? [] },
    { headers: { 'x-request-id': requestId } }
  );
});

export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdminRequest(req, requestId);
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

  const supabase = createAdminClient();
  const code = normalizeCode(parsed.data.code);
  const description = parsed.data.description?.trim() || null;
  const maxUses = parsed.data.max_uses ?? 1;
  const discountPercent = parsed.data.discount_percent ?? 100;
  const active = parsed.data.active ?? true;

  const { data, error } = await supabase
    .from('vsyc_comp_codes')
    .insert({
      code,
      description,
      max_uses: maxUses,
      discount_percent: discountPercent,
      expires_at: parsed.data.expires_at,
      active,
    })
    .select('code, description, max_uses, uses_count, expires_at, active, discount_percent, created_at')
    .single();

  if (error || !data) {
    const message = error?.message ?? 'Failed to create comp code';
    const codeName = /duplicate|unique/i.test(message) ? 'conflict' : 'upstream_error';
    return apiError(codeName, message, requestId);
  }

  await logAudit('created', {
    actor: 'admin',
    details: {
      comp_code: data.code,
      discount_percent: discountPercent,
      max_uses: maxUses,
      active,
    },
  });

  return NextResponse.json(
    { ok: true, code: data },
    { headers: { 'x-request-id': requestId } }
  );
});

export const PATCH = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = toggleCodeSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }

  const supabase = createAdminClient();
  const code = normalizeCode(parsed.data.code);

  const { data, error } = await supabase
    .from('vsyc_comp_codes')
    .update({ active: parsed.data.active })
    .eq('code', code)
    .select('code, description, max_uses, uses_count, expires_at, active, discount_percent, created_at')
    .single();

  if (error || !data) {
    return apiError('upstream_error', error?.message ?? 'Failed to update comp code', requestId);
  }

  await logAudit('updated', {
    actor: 'admin',
    details: {
      comp_code: data.code,
      active: parsed.data.active,
    },
  });

  return NextResponse.json(
    { ok: true, code: data },
    { headers: { 'x-request-id': requestId } }
  );
});
