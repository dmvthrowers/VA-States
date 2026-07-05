import { createAdminClient } from '@/lib/supabase/admin';

// Live admin data — never prerender at build time.
export const dynamic = 'force-dynamic';

const DIVISIONS = ['1A', 'X', 'SBJ'] as const;
type Division = typeof DIVISIONS[number];

interface ScoreRow {
  registration_id: string;
  division: string;
  judge_name: string;
  display_name: string;
  city: string | null;
  state: string | null;
  execution: number;
  difficulty: number;
  presentation: number;
  total: number;
  notes: string | null;
  created_at: string;
}

interface Competitor {
  registration_id: string;
  display_name: string;
  city: string | null;
  state: string | null;
  scores: { judge_name: string; execution: number; difficulty: number; presentation: number; total: number }[];
  avg_execution: number;
  avg_difficulty: number;
  avg_presentation: number;
  avg_total: number;
  judge_count: number;
}

async function getResults(): Promise<Record<Division, Competitor[]>> {
  const supabase = createAdminClient();

  const { data: scores, error } = await supabase
    .from('vsyc_results')
    .select('*');

  if (error || !scores) return { '1A': [], X: [], SBJ: [] };

  const grouped: Record<Division, Map<string, Competitor>> = {
    '1A': new Map(),
    X: new Map(),
    SBJ: new Map(),
  };

  for (const row of scores as ScoreRow[]) {
    const div = row.division as Division;
    if (!grouped[div]) continue;

    if (!grouped[div].has(row.registration_id)) {
      grouped[div].set(row.registration_id, {
        registration_id: row.registration_id,
        display_name: row.display_name,
        city: row.city,
        state: row.state,
        scores: [],
        avg_execution: 0,
        avg_difficulty: 0,
        avg_presentation: 0,
        avg_total: 0,
        judge_count: 0,
      });
    }

    const comp = grouped[div].get(row.registration_id)!;
    comp.scores.push({
      judge_name: row.judge_name,
      execution: Number(row.execution),
      difficulty: Number(row.difficulty),
      presentation: Number(row.presentation),
      total: Number(row.total),
    });
  }

  const result: Record<Division, Competitor[]> = { '1A': [], X: [], SBJ: [] };

  for (const div of DIVISIONS) {
    for (const comp of grouped[div].values()) {
      const n = comp.scores.length;
      comp.judge_count = n;
      comp.avg_execution = Math.round((comp.scores.reduce((s, x) => s + x.execution, 0) / n) * 100) / 100;
      comp.avg_difficulty = Math.round((comp.scores.reduce((s, x) => s + x.difficulty, 0) / n) * 100) / 100;
      comp.avg_presentation = Math.round((comp.scores.reduce((s, x) => s + x.presentation, 0) / n) * 100) / 100;
      comp.avg_total = Math.round((comp.scores.reduce((s, x) => s + x.total, 0) / n) * 100) / 100;
      result[div].push(comp);
    }
    result[div].sort((a, b) => b.avg_total - a.avg_total);
  }

  return result;
}

export const revalidate = 10;

export default async function AdminResultsPage() {
  const results = await getResults();
  const totalScored = Object.values(results).reduce((s, arr) => s + arr.length, 0);

  const judges = new Set<string>();
  Object.values(results).forEach((comps) => comps.forEach((c) => c.scores.forEach((s) => judges.add(s.judge_name))));

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.5rem', margin: '0 0 0.25rem' }}>
          Results
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
          {totalScored} competitor{totalScored !== 1 ? 's' : ''} scored · {judges.size} judge{judges.size !== 1 ? 's' : ''}: {[...judges].join(', ') || '—'}
        </p>
      </div>

      {DIVISIONS.map((div) => {
        const comps = results[div];
        return (
          <section key={div} style={{ marginBottom: '2.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <h2 style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.1rem', margin: 0 }}>
                {div} Division
              </h2>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                {comps.length} scored
              </span>
            </div>

            {comps.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No scores submitted yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--navy)', borderBottom: '2px solid var(--navy-border)' }}>
                      {['Rank', 'Competitor', 'Location', 'Judges', 'Avg Exec', 'Avg Diff', 'Avg Pres', 'Avg Total'].map((h) => (
                        <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: h === 'Avg Total' || h === 'Rank' ? 'center' : 'left', fontSize: '0.6rem', letterSpacing: '0.1em', fontWeight: 800, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comps.map((comp, i) => (
                      <tr key={comp.registration_id} style={{ borderBottom: '1px solid var(--navy-border)', background: i === 0 ? '#1a1400' : i % 2 === 0 ? 'var(--navy)' : 'transparent' }}>
                        <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', fontWeight: 800, color: i === 0 ? 'var(--gold)' : 'var(--text-muted)', fontSize: '0.8rem' }}>
                          {i + 1}
                        </td>
                        <td style={{ padding: '0.6rem 0.75rem', fontWeight: 700, color: i === 0 ? 'var(--gold)' : '#fff' }}>
                          {comp.display_name}
                        </td>
                        <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                          {[comp.city, comp.state].filter(Boolean).join(', ') || '—'}
                        </td>
                        <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                          {comp.judge_count}
                        </td>
                        <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: 'var(--text-body)', fontFamily: 'monospace' }}>{comp.avg_execution.toFixed(1)}</td>
                        <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: 'var(--text-body)', fontFamily: 'monospace' }}>{comp.avg_difficulty.toFixed(1)}</td>
                        <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: 'var(--text-body)', fontFamily: 'monospace' }}>{comp.avg_presentation.toFixed(1)}</td>
                        <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 800, color: i === 0 ? 'var(--gold)' : '#fff', fontFamily: 'monospace', fontSize: '1rem' }}>
                          {comp.avg_total.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Per-judge breakdown for top 3 */}
                {comps.slice(0, 3).some((c) => c.scores.length > 1) && (
                  <details style={{ marginTop: '0.75rem' }}>
                    <summary style={{ fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none', padding: '0.25rem 0' }}>
                      Per-judge breakdown (top 3)
                    </summary>
                    <div style={{ marginTop: '0.5rem', border: '1px solid var(--navy-border)', overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead>
                          <tr style={{ background: 'var(--navy)', borderBottom: '1px solid var(--navy-border)' }}>
                            {['Competitor', 'Judge', 'Exec', 'Diff', 'Pres', 'Total'].map((h) => (
                              <th key={h} style={{ padding: '0.4rem 0.6rem', textAlign: 'left', fontSize: '0.55rem', letterSpacing: '0.1em', fontWeight: 800, color: 'var(--text-muted)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {comps.slice(0, 3).flatMap((comp) =>
                            comp.scores.map((s, si) => (
                              <tr key={`${comp.registration_id}-${s.judge_name}`} style={{ borderBottom: '1px solid var(--navy-border)', background: si % 2 === 0 ? 'var(--navy)' : 'transparent' }}>
                                <td style={{ padding: '0.4rem 0.6rem', color: '#fff', fontWeight: si === 0 ? 700 : 400 }}>{si === 0 ? comp.display_name : ''}</td>
                                <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-muted)' }}>{s.judge_name}</td>
                                <td style={{ padding: '0.4rem 0.6rem', fontFamily: 'monospace', color: 'var(--text-body)' }}>{s.execution.toFixed(1)}</td>
                                <td style={{ padding: '0.4rem 0.6rem', fontFamily: 'monospace', color: 'var(--text-body)' }}>{s.difficulty.toFixed(1)}</td>
                                <td style={{ padding: '0.4rem 0.6rem', fontFamily: 'monospace', color: 'var(--text-body)' }}>{s.presentation.toFixed(1)}</td>
                                <td style={{ padding: '0.4rem 0.6rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--gold)' }}>{s.total.toFixed(1)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
