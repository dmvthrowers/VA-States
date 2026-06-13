import { getDb } from './db';

export async function logAudit(
  action: string,
  opts: {
    registrationId?: string;
    actor?: string;
    details?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    await getDb()
      .prepare(
        'INSERT INTO vsyc_audit_log (registration_id, actor, action, details) VALUES (?1, ?2, ?3, ?4)'
      )
      .bind(
        opts.registrationId ?? null,
        opts.actor ?? 'system',
        action,
        JSON.stringify(opts.details ?? {}),
      )
      .run();
  } catch (e) {
    // Audit failures must never crash the main request path
    console.error('[audit] log failed:', e);
  }
}
