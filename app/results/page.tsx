import { createAdminClient } from '@/lib/supabase/admin';
import { getEventFlagBoolean } from '@/lib/event-flags';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';

// Public results are gated with an admin-toggleable flag and env fallback.

const DIVISIONS: { code: Division; label: string }[] = [
  { code: '1A',  label: '1A — Single String' },
  { code: 'X',   label: 'X Division' },
  { code: 'SBJ', label: 'Sport / Beginner / Junior' },
];

type Division = '1A' | 'X' | 'SBJ';

interface ResultRow {
  registration_id: string;
  division: string;
  display_name: string;
  city: string | null;
  state: string | null;
  execution: number | string;
  difficulty: number | string;
  presentation: number | string;
  total: number | string;
}

interface Standing {
  registration_id: string;
  display_name: string;
  city: string | null;
  state: string | null;
  judge_count: number;
  avg_total: number;
}

async function getStandings(): Promise<Record<Division, Standing[]>> {
  const empty: Record<Division, Standing[]> = { '1A': [], X: [], SBJ: [] };
  const supabase = createAdminClient();

  const { data, error } = await supabase.from('vsyc_results').select('*');
  if (error || !data) return empty;

  const grouped: Record<Division, Map<string, { s: Standing; sum: number }>> = {
    '1A': new Map(), X: new Map(), SBJ: new Map(),
  };

  for (const row of data as ResultRow[]) {
    const div = row.division as Division;
    if (!grouped[div]) continue;
    if (!grouped[div].has(row.registration_id)) {
      grouped[div].set(row.registration_id, {
        s: {
          registration_id: row.registration_id,
          display_name: row.display_name,
          city: row.city,
          state: row.state,
          judge_count: 0,
          avg_total: 0,
        },
        sum: 0,
      });
    }
    const entry = grouped[div].get(row.registration_id)!;
    entry.s.judge_count += 1;
    entry.sum += Number(row.total);
  }

  const result: Record<Division, Standing[]> = { '1A': [], X: [], SBJ: [] };
  for (const { code } of DIVISIONS) {
    for (const { s, sum } of grouped[code].values()) {
      s.avg_total = s.judge_count > 0 ? Math.round((sum / s.judge_count) * 100) / 100 : 0;
      result[code].push(s);
    }
    result[code].sort((a, b) => b.avg_total - a.avg_total);
  }
  return result;
}

// Refresh at most once per minute once published.
export const revalidate = 60;

const PLACE_COLORS = ['var(--gold)', '#c7c7d1', '#cd7f32']; // 1st gold · 2nd silver · 3rd bronze

export default async function ResultsPage() {
  const resultsPublished = await getEventFlagBoolean('results_published', process.env.RESULTS_PUBLISHED === 'true');
  const standings = resultsPublished ? await getStandings() : null;
  const total = standings
    ? Object.values(standings).reduce((s, arr) => s + arr.length, 0)
    : 0;

  return (
    <>
      <NavBar />
      <main id="main-content" style={{ maxWidth: 820, margin: '0 auto', padding: '3rem 1.5rem', minHeight: '60vh' }}>
        <header style={{ marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '0.6rem', letterSpacing: '0.18em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.5rem' }}>
            VSYC-26 · SEPT 19, 2026 · DULLES TOWN CENTER
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", color: '#fff', fontSize: '2rem', margin: '0 0 0.5rem' }}>
            Contest Results
          </h1>
          <p style={{ color: 'var(--text-body)', margin: 0 }}>
            {!resultsPublished
              ? 'Final standings will be posted here after the contest.'
              : total === 0
                ? 'Results are being finalized — check back shortly.'
                : 'Final standings, averaged across all judges.'}
          </p>
        </header>

        {!resultsPublished || !standings ? (
          <section style={{ border: '1px solid var(--navy-border)', background: 'var(--navy)', padding: '2.5rem 1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🏆</div>
            <p style={{ color: '#fff', fontWeight: 700, margin: '0 0 0.5rem' }}>
              Results drop right after the contest.
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
              Competing on September 19? See who&rsquo;s registered on the{' '}
              <a href="/competitors" style={{ color: 'var(--gold-light)' }}>competitors page</a>.
            </p>
          </section>
        ) : (
          DIVISIONS.map(({ code, label }) => {
            const comps = standings[code];
            return (
              <section key={code} style={{ marginBottom: '2.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '1rem' }}>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.2rem', margin: 0 }}>
                    {label}
                  </h2>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    {comps.length} placed
                  </span>
                </div>

                {comps.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0, paddingLeft: '1rem' }}>
                    No results for this division.
                  </p>
                ) : (
                  <div style={{ border: '1px solid var(--navy-border)' }}>
                    {comps.map((c, i) => {
                      const placeColor = i < 3 ? PLACE_COLORS[i] : 'var(--text-muted)';
                      return (
                        <div
                          key={c.registration_id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.85rem 1rem',
                            borderBottom: i < comps.length - 1 ? '1px solid var(--navy-border)' : 'none',
                            background: i === 0 ? '#1a1400' : i % 2 === 0 ? 'var(--navy)' : 'transparent',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minWidth: 0 }}>
                            <span style={{
                              width: '1.75rem', flexShrink: 0, textAlign: 'center',
                              fontSize: '0.95rem', fontWeight: 800, color: placeColor,
                            }}>
                              {i + 1}
                            </span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: i === 0 ? 'var(--gold)' : '#fff', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {c.display_name}
                              </div>
                              {(c.city || c.state) && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                  {[c.city, c.state].filter(Boolean).join(', ')}
                                </div>
                              )}
                            </div>
                          </div>
                          <span style={{
                            fontFamily: 'monospace', fontWeight: 800,
                            fontSize: '1.05rem', color: i === 0 ? 'var(--gold)' : '#fff',
                            flexShrink: 0, paddingLeft: '1rem',
                          }}>
                            {c.avg_total.toFixed(1)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })
        )}

        <footer style={{ borderTop: '1px solid var(--navy-border)', paddingTop: '1.5rem', marginTop: '1rem' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
            Scores are averaged across all judges. Questions about results?{' '}
            <a href="mailto:dmvthrowers@gmail.com" style={{ color: 'var(--gold-light)' }}>dmvthrowers@gmail.com</a>
          </p>
        </footer>
      </main>
      <Footer />
    </>
  );
}
