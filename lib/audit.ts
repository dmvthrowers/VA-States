import { createAdminClient } from './supabase/admin';

export async function logAudit(
  action: string,
  opts: {
    registrationId?: string;
    actor?: string;
    details?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from('vsyc_audit_log').insert({
      action,
      registration_id: opts.registrationId ?? null,
      actor: opts.actor ?? 'system',
      details: opts.details ?? {},
    });
  } catch (e) {
    // Audit failures must never crash the main request path
    console.error('[audit] log failed:', e);
  }
}
