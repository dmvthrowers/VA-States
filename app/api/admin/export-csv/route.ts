import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminRequest } from '@/lib/auth/admin-request';
import { contest } from '@/contest.config';

const COLUMNS = [
  'id', 'created_at', 'last_name', 'first_name', 'preferred_bracket_name',
  'age_on_event', 'divisions', 'division_styles', 'fee_cents', 'paid',
  'payment_method', 'comp_code', 'music_filename', 'music_uploaded_at',
  'email', 'phone', 'parent_email', 'registration_source', 'bracket_seed', 'admin_notes',
];

function csvRow(values: string[]): string {
  return values.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
}

export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('vsyc_registrations')
    .select(COLUMNS.join(','))
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[export-csv] query error:', error);
    return apiError('upstream_error', 'Failed to query registrations', requestId);
  }

  const rows = (data ?? []).map(row =>
    csvRow(COLUMNS.map(col => {
      const val = (row as unknown as Record<string, unknown>)[col];
      if (Array.isArray(val)) return val.join(';');
      // division_styles {"X": ["2A", "3A"]} → "X: 2A 3A"
      if (val && typeof val === 'object') {
        return Object.entries(val as Record<string, unknown>).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : String(v)}`).join('; ');
      }
      return String(val ?? '');
    }))
  );

  const csv = [csvRow(COLUMNS), ...rows].join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="vsyc26-registrations-${new Date().toISOString().slice(0,10)}.csv"`,
      'x-request-id': requestId,
    },
  });
});
