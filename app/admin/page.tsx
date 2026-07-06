import { createAdminClient } from '@/lib/supabase/admin';
import { formatCents } from '@/lib/pricing';

interface RegRow {
  id: string;
  created_at: string;
  first_name: string;
  last_name: string;
  email: string;
  divisions: string[];
  fee_cents: number;
  paid: boolean;
  paid_at: string | null;
  music_uploaded_at: string | null;
  is_minor: boolean;
  comp_code: string | null;
  registration_source: string;
}

export const dynamic = 'force-dynamic';

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ division?: string; paid?: string; music?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const supabase = createAdminClient();

  let query = supabase
    .from('vsyc_registrations')
    .select('id, created_at, first_name, last_name, email, divisions, fee_cents, paid, paid_at, music_uploaded_at, is_minor, comp_code, registration_source')
    .order('created_at', { ascending: false });

  if (sp.paid === '1') query = query.eq('paid', true);
  if (sp.paid === '0') query = query.eq('paid', false);
  if (sp.music === '1') query = query.not('music_uploaded_at', 'is', null);
  if (sp.music === '0') query = query.is('music_uploaded_at', null);
  if (sp.division) query = query.contains('divisions', [sp.division]);
  if (sp.q) query = query.or(`first_name.ilike.%${sp.q}%,last_name.ilike.%${sp.q}%,email.ilike.%${sp.q}%`);

  const { data: rows, error } = await query.returns<RegRow[]>();

  const totalFee = (rows ?? []).reduce((s, r) => s + r.fee_cents, 0);
  const paidCount = (rows ?? []).filter(r => r.paid).length;
  const musicCount = (rows ?? []).filter(r => r.music_uploaded_at).length;

  const filterLink = (extra: Record<string, string>) => {
    const merged = { ...sp, ...extra };
    const clean = Object.fromEntries(Object.entries(merged).filter(([, v]) => v));
    return '/admin?' + new URLSearchParams(clean).toString();
  };

  const pill = (label: string, active: boolean, href: string) => (
    <a
      href={href}
      style={{
        display: 'inline-block',
        padding: '0.25rem 0.75rem',
        fontSize: '0.75rem',
        fontWeight: 700,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        textDecoration: 'none',
        background: active ? 'var(--gold)' : 'var(--navy)',
        color: active ? 'var(--navy-deep)' : 'var(--text-body)',
        border: `1px solid ${active ? 'var(--gold)' : 'var(--navy-border)'}`,
        marginRight: 4,
      }}
    >
      {label}
    </a>
  );

  return (
    <>
      {/* Stats bar */}
      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        {[
          { label: 'Total registrations', value: rows?.length ?? 0 },
          { label: 'Paid', value: `${paidCount} / ${rows?.length ?? 0}` },
          { label: 'Music uploaded', value: `${musicCount} / ${rows?.length ?? 0}` },
          { label: 'Projected revenue', value: `$${formatCents(totalFee)}` },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '1rem 1.5rem', flex: '1 1 160px' }}>
            <div style={{ color: 'var(--text-body)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>{s.label}</div>
            <div style={{ color: 'var(--gold)', fontFamily: "'Playfair Display', serif", fontSize: '1.6rem', fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <form method="GET" action="/admin" style={{ display: 'flex', gap: '0.5rem', marginRight: '1rem' }}>
          {sp.division && <input type="hidden" name="division" value={sp.division} />}
          {sp.paid && <input type="hidden" name="paid" value={sp.paid} />}
          {sp.music && <input type="hidden" name="music" value={sp.music} />}
          <input
            name="q"
            defaultValue={sp.q ?? ''}
            placeholder="Search name / email…"
            style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', color: '#fff', padding: '0.4rem 0.75rem', fontSize: '0.85rem', width: 220 }}
          />
          <button type="submit" style={{ background: 'var(--gold)', color: 'var(--navy-deep)', border: 'none', padding: '0.4rem 0.75rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }}>
            Search
          </button>
          {sp.q && <a href={filterLink({ q: '' })} style={{ color: 'var(--text-body)', fontSize: '0.8rem', alignSelf: 'center', textDecoration: 'none' }}>✕ clear</a>}
        </form>

        {pill('All', !sp.paid, filterLink({ paid: '' }))}
        {pill('Paid', sp.paid === '1', filterLink({ paid: '1' }))}
        {pill('Unpaid', sp.paid === '0', filterLink({ paid: '0' }))}
        <span style={{ width: 1, background: 'var(--navy-border)', height: 20, display: 'inline-block', margin: '0 4px' }} />
        {pill('All music', !sp.music, filterLink({ music: '' }))}
        {pill('Has music', sp.music === '1', filterLink({ music: '1' }))}
        {pill('No music', sp.music === '0', filterLink({ music: '0' }))}
        <span style={{ width: 1, background: 'var(--navy-border)', height: 20, display: 'inline-block', margin: '0 4px' }} />
        {['1A', '2A', '3A', '4A', '5A', 'X', 'Beginner', 'Junior'].map(d =>
          pill(d, sp.division === d, filterLink({ division: sp.division === d ? '' : d }))
        )}
      </div>

      {error && (
        <p style={{ color: '#ff6b6b' }}>Error loading registrations: {error.message}</p>
      )}

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--navy-border)' }}>
              {['Date', 'Name', 'Email', 'Divisions', 'Fee', 'Paid', 'Music', 'Source', 'Actions'].map(h => (
                <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: 'var(--text-body)', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-body)' }}>
                  No registrations found.
                </td>
              </tr>
            )}
            {(rows ?? []).map(row => (
              <tr key={row.id} style={{ borderBottom: '1px solid var(--navy-border)' }}>
                <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-body)', whiteSpace: 'nowrap' }}>
                  {new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </td>
                <td style={{ padding: '0.6rem 0.75rem', color: '#fff', whiteSpace: 'nowrap' }}>
                  {row.first_name} {row.last_name}
                  {row.is_minor && <span style={{ color: 'var(--gold)', fontSize: '0.65rem', marginLeft: 4 }}>MINOR</span>}
                </td>
                <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-body)' }}>
                  <a href={`mailto:${row.email}`} style={{ color: 'var(--text-body)', textDecoration: 'none' }}>{row.email}</a>
                </td>
                <td style={{ padding: '0.6rem 0.75rem', color: '#fff' }}>
                  {row.divisions.join(', ')}
                  {row.comp_code && <span style={{ color: 'var(--gold-light)', fontSize: '0.7rem', display: 'block' }}>Code: {row.comp_code}</span>}
                </td>
                <td style={{ padding: '0.6rem 0.75rem', color: row.fee_cents === 0 ? '#7fff7f' : '#fff', whiteSpace: 'nowrap' }}>
                  {row.fee_cents === 0 ? 'COMP' : `$${formatCents(row.fee_cents)}`}
                </td>
                <td style={{ padding: '0.6rem 0.75rem' }}>
                  <form method="POST" action="/api/admin/mark-paid">
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="paid" value={row.paid ? '0' : '1'} />
                    <button
                      type="submit"
                      style={{
                        background: row.paid ? '#0d2a1a' : 'transparent',
                        border: `1px solid ${row.paid ? '#2a7a4a' : 'var(--navy-border)'}`,
                        color: row.paid ? '#7fff7f' : 'var(--text-body)',
                        padding: '0.2rem 0.5rem',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {row.paid ? '✓ Paid' : 'Mark Paid'}
                    </button>
                  </form>
                </td>
                <td style={{ padding: '0.6rem 0.75rem' }}>
                  {row.music_uploaded_at
                    ? <span style={{ color: '#7fff7f', fontSize: '0.8rem' }}>✓ {new Date(row.music_uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    : <span style={{ color: 'var(--text-body)', fontSize: '0.8rem' }}>—</span>
                  }
                </td>
                <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-body)', fontSize: '0.75rem' }}>
                  {row.registration_source}
                </td>
                <td style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap' }}>
                  <a
                    href={`/confirm?id=${row.id}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--gold-light)', fontSize: '0.75rem', textDecoration: 'none' }}
                  >
                    View →
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
