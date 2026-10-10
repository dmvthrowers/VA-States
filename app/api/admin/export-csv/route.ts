import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminRequest } from '@/lib/auth/admin-request';
import { competition } from '@/contest.config';
import { slotKey } from '@/lib/music';
import { slotsOf } from '@/lib/music-config';

// One music column per track a division asks for: music_1A for a division's single track,
// music_1A_prelims / music_1A_final when it has several (rounds, battle music...).
const MUSIC_COLUMNS = competition.divisions.flatMap((d) => {
  const defs = slotsOf(d.code);
  return defs.map((def) => ({ column: defs.length > 1 ? `music_${d.code}_${def.key}` : `music_${d.code}`, division: d.code, slot: def.key }));
});

const COLUMNS = [
  'id', 'created_at', 'last_name', 'first_name', 'preferred_bracket_name',
  'age_on_event', 'divisions', 'division_styles', 'fee_cents', 'paid',
  'payment_method', 'comp_code', ...MUSIC_COLUMNS.map((m) => m.column), 'music_uploaded_at',
  'email', 'phone', 'parent_email', 'registration_source', 'bracket_seed', 'admin_notes', 'code_of_conduct_version',
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
    .select(COLUMNS.filter((c) => !MUSIC_COLUMNS.some((m) => m.column === c)).join(','))
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[export-csv] query error:', error);
    return apiError('upstream_error', 'Failed to query registrations', requestId);
  }

  const { data: tracks, error: tracksError } = await supabase
    .from('vsyc_music')
    .select('registration_id, division, slot, filename, is_fallback');
  if (tracksError) {
    console.error('[export-csv] music query error:', tracksError);
    return apiError('upstream_error', 'Failed to query music', requestId);
  }
  // "<registration id>:<division>:<slot>" → what the CSV shows. Lo-fi fallbacks are marked.
  const trackLabel = new Map((tracks ?? []).map((t) => [`${t.registration_id}:${slotKey(t.division, t.slot)}`, t.is_fallback ? `LO-FI (no upload): ${t.filename}` : t.filename]));

  const rows = (data ?? []).map(row =>
    csvRow(COLUMNS.map(col => {
      const rec = row as unknown as Record<string, unknown>;
      const music = MUSIC_COLUMNS.find((m) => m.column === col);
      if (music) return trackLabel.get(`${rec.id}:${slotKey(music.division, music.slot)}`) ?? '';
      const val = rec[col];
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
