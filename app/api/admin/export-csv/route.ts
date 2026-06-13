import { NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';

const COLUMNS = [
  'id', 'created_at', 'last_name', 'first_name', 'preferred_bracket_name',
  'age_on_event', 'divisions', 'x_substyle', 'fee_cents', 'paid',
  'payment_method', 'comp_code', 'music_filename', 'music_uploaded_at',
  'email', 'phone', 'parent_email', 'registration_source', 'bracket_seed', 'admin_notes',
];

// Neutralize spreadsheet formula injection: registrant-controlled values
// starting with = or @ (or +/- unless they're plain numbers/phone-like)
// would otherwise execute when the CSV is opened in Excel/Sheets.
function csvSafe(v: string): string {
  if (/^[=@]/.test(v)) return `'${v}`;
  if (/^[+\-]/.test(v) && !/^[+\-][\d\s().\-]*$/.test(v)) return `'${v}`;
  return v;
}

function csvRow(values: string[]): string {
  return values.map(v => `"${csvSafe(String(v ?? '')).replace(/"/g, '""')}"`).join(',');
}

export const GET = withErrorHandling(async (requestId) => {
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
