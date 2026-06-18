import { NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { getDb, parseDivisions } from '@/lib/db';

export const dynamic = 'force-dynamic';

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
  let data: Record<string, unknown>[];
  try {
    const { results } = await getDb()
      .prepare(`SELECT ${COLUMNS.join(', ')} FROM vsyc_registrations ORDER BY created_at ASC`)
      .all<Record<string, unknown>>();
    data = results;
  } catch (error) {
    console.error('[export-csv] query error:', error);
    return apiError('upstream_error', 'Failed to query registrations', requestId);
  }

  const rows = data.map(row =>
    csvRow(COLUMNS.map(col => {
      const val = row[col];
      if (col === 'divisions') return parseDivisions(val as string).join(';');
      if (col === 'paid') return val ? 'true' : 'false';
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
