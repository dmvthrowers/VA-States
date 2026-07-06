import { createAdminClient } from '@/lib/supabase/admin';

interface CodeRow {
  code: string;
  description: string | null;
  max_uses: number;
  uses_count: number;
  expires_at: string;
  active: boolean;
  created_at: string;
}

export const dynamic = 'force-dynamic';

export default async function CodesPage() {
  const supabase = createAdminClient();
  const { data: codes, error } = await supabase
    .from('vsyc_comp_codes')
    .select('*')
    .order('created_at', { ascending: false })
    .returns<CodeRow[]>();

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.8rem', margin: 0 }}>
          Comp Codes
        </h1>
      </div>

      {error && <p style={{ color: '#ff6b6b' }}>Error: {error.message}</p>}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--navy-border)' }}>
              {['Code', 'Description', 'Used / Max', 'Expires', 'Active', 'Toggle'].map(h => (
                <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: 'var(--text-body)', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(codes ?? []).length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-body)' }}>
                  No comp codes found.
                </td>
              </tr>
            )}
            {(codes ?? []).map(row => {
              const exhausted = row.uses_count >= row.max_uses;
              const expired = new Date(row.expires_at) < new Date();
              return (
                <tr key={row.code} style={{ borderBottom: '1px solid var(--navy-border)', opacity: (!row.active || expired) ? 0.5 : 1 }}>
                  <td style={{ padding: '0.6rem 0.75rem' }}>
                    <code style={{ color: 'var(--gold)', fontFamily: 'monospace', fontSize: '0.9rem' }}>{row.code}</code>
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-body)' }}>
                    {row.description ?? '—'}
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem' }}>
                    <span style={{ color: exhausted ? '#ff6b6b' : '#fff' }}>{row.uses_count}</span>
                    <span style={{ color: 'var(--text-body)' }}> / {row.max_uses}</span>
                    {exhausted && <span style={{ color: '#ff6b6b', fontSize: '0.7rem', marginLeft: 6 }}>EXHAUSTED</span>}
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem', color: expired ? '#ff6b6b' : 'var(--text-body)', whiteSpace: 'nowrap' }}>
                    {new Date(row.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {expired && <span style={{ fontSize: '0.7rem', marginLeft: 6 }}>EXPIRED</span>}
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem' }}>
                    <span style={{ color: row.active ? '#7fff7f' : '#ff6b6b', fontWeight: 700, fontSize: '0.8rem' }}>
                      {row.active ? '✓ Active' : '✗ Disabled'}
                    </span>
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem' }}>
                    <form method="POST" action="/api/admin/toggle-code">
                      <input type="hidden" name="code" value={row.code} />
                      <input type="hidden" name="active" value={row.active ? '0' : '1'} />
                      <button
                        type="submit"
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--navy-border)',
                          color: 'var(--text-body)',
                          padding: '0.2rem 0.5rem',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {row.active ? 'Disable' : 'Enable'}
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'var(--navy)', border: '1px solid var(--navy-border)', fontSize: '0.8rem', color: 'var(--text-body)' }}>
        <strong style={{ color: '#fff' }}>Note:</strong> To add new codes, run a SQL migration or insert directly via the Supabase dashboard.
        Codes are validated at registration time — disabling a code prevents future use but does not affect existing registrations.
      </div>
    </>
  );
}
