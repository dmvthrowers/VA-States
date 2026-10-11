import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { itemFields, moduleAuth } from '@/lib/modules-server';
import { MODULES } from '@/lib/modules';

type Ctx = { params: Promise<{ module: string }> };

/** Run sheet for one module (docs/ROLES.md). GET lists it, POST adds an item. */
export const GET = withErrorHandling(async (requestId, req: NextRequest, ctx: Ctx) => {
  const a = await moduleAuth(req, requestId, (await ctx.params).module);
  if (!a.ok) return a.error;

  const { data, error } = await createAdminClient()
    .from('vsyc_module_items')
    .select('id, title, body, status, position, qty, link')
    .eq('module', a.module)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return apiError('upstream_error', 'Could not load the list', requestId);
  return NextResponse.json({ module: a.module, def: MODULES[a.module], items: data ?? [] }, { headers: { 'x-request-id': requestId, 'Cache-Control': 'no-store' } });
});

export const POST = withErrorHandling(async (requestId, req: NextRequest, ctx: Ctx) => {
  const a = await moduleAuth(req, requestId, (await ctx.params).module);
  if (!a.ok) return a.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }
  const parsed = itemFields.partial({ status: true, position: true }).safeParse(body);
  if (!parsed.success) return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  const d = parsed.data;
  const def = MODULES[a.module];

  const supabase = createAdminClient();
  // New items go to the end.
  const { data: last } = await supabase.from('vsyc_module_items').select('position').eq('module', a.module).order('position', { ascending: false }).limit(1);
  const position = d.position ?? ((last?.[0]?.position ?? -1) + 1);

  const { data, error } = await supabase
    .from('vsyc_module_items')
    .insert({
      module: a.module,
      title: d.title,
      body: d.body || null,
      status: d.status ?? 'todo',
      position,
      qty: def.useQty ? d.qty ?? 0 : null,
      link: def.useLink ? d.link || null : null,
      updated_by: a.identity.authUserId,
    })
    .select('id')
    .single();
  if (error || !data) return apiError('upstream_error', 'Could not save the item', requestId);
  return NextResponse.json({ ok: true, id: data.id }, { status: 201, headers: { 'x-request-id': requestId } });
});
