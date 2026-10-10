import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEventFlagBoolean } from '@/lib/event-flags';
import { isPublished, publishedDivisions, visibilityFrom, type ResultsVisibility } from '@/lib/results-visibility';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import { contest, competition, bannerLine } from '@/contest.config';
import { betterOf, roundsOf } from '@/lib/divisions-core';
import { buildJudgeSheets, type JudgeScoreRow } from '@/lib/judges-scores';

// Public, and gated like the rest of the results: a round shows only once it is released
// (the results_published flag, or Publish results on the admin schedule). Off unless contest.judgesScores.enabled.
export const revalidate = 60;

async function getVisibility(): Promise<ResultsVisibility> {
  try {
    return await publishedDivisions(createAdminClient());
  } catch (e) {
    console.error('[results/judges] visibility check failed:', e);
    return visibilityFrom(await getEventFlagBoolean('results_published', process.env.RESULTS_PUBLISHED === 'true'), []);
  }
}

async function getRows(): Promise<JudgeScoreRow[]> {
  try {
    const { data, error } = await createAdminClient()
      .from('vsyc_results')
      .select('registration_id, division, round, display_name, judge_name, judge_user_id, final_score');
    if (error) {
      console.error('[results/judges] query error:', error.message);
      return [];
    }
    return (data ?? []) as JudgeScoreRow[];
  } catch (e) {
    console.error('[results/judges] query failed:', e);
    return [];
  }
}

export default async function JudgesScoresPage() {
  if (!contest.judgesScores.enabled) notFound();
  const vis = await getVisibility();
  const rows = (await getRows()).filter((r) => isPublished(vis, r.division, r.round ?? 1));
  const sheets = buildJudgeSheets(rows, (code) => ({
    showNames: contest.judgesScores.showJudgeNames,
    better: betterOf(competition.divisions.find((d) => d.code === code)?.scoring),
  }));

  return (
    <>
      <NavBar />
      <main id="main-content" style={{ maxWidth: 980, margin: '0 auto', padding: '3rem 1.5rem', minHeight: '60vh' }}>
        <header style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: '0.6rem', letterSpacing: '0.18em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.5rem' }}>
            {contest.shortName} · {bannerLine}
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", color: '#fff', fontSize: '2rem', margin: '0 0 0.5rem' }}>Judges&rsquo; Scores</h1>
          <p style={{ color: 'var(--text-body)', margin: 0 }}>
            Every judge&rsquo;s score for every competitor, once a round&rsquo;s results are released.
            {contest.judgesScores.showJudgeNames ? '' : ' Judges are shown as Judge A, B and C, in the same order on every table.'}
          </p>
          <p style={{ margin: '0.5rem 0 0' }}>
            <a href="/results" style={{ color: 'var(--gold-light)' }}>&larr; Back to results</a>
          </p>
        </header>

        {sheets.length === 0 && (
          <p style={{ color: 'var(--text-muted)' }}>No scores are released yet. They appear here as each round&rsquo;s results go public.</p>
        )}

        {sheets.map((s) => {
          const def = competition.divisions.find((d) => d.code === s.division);
          const rounds = def ? roundsOf(def) : [];
          const title = `${def?.name ?? s.division}${rounds.length > 1 ? ` · ${rounds[s.round - 1]?.name ?? `Round ${s.round}`}` : ''}`;
          const id = `s-${s.division}-${s.round}`;
          return (
            <section key={id} aria-labelledby={id} style={{ marginBottom: '2.5rem' }}>
              <h2 id={id} style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.2rem', margin: '0 0 0.75rem' }}>{title}</h2>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', color: 'var(--text-body)', border: '1px solid var(--navy-border)', background: 'var(--navy)' }}>
                  <caption style={{ position: 'absolute', left: '-9999px' }}>{title}: each judge&rsquo;s score and the average</caption>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                      <th scope="col" style={{ padding: '0.5rem 0.75rem' }}>Competitor</th>
                      {s.judges.map((j) => <th key={j} scope="col" style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{j}</th>)}
                      <th scope="col" style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Average</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.entries.map((e) => (
                      <tr key={e.registration_id} style={{ borderTop: '1px solid var(--navy-border)' }}>
                        <th scope="row" style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: '#fff', fontWeight: 600 }}>{e.name}</th>
                        {e.scores.map((v, i) => <td key={i} style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{v === null ? '—' : v.toFixed(2)}</td>)}
                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: 'var(--gold-light)', fontWeight: 700 }}>{e.average === null ? '—' : e.average.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </main>
      <Footer />
    </>
  );
}
