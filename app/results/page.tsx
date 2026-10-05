import { createAdminClient } from '@/lib/supabase/admin';
import { getEventFlagBoolean } from '@/lib/event-flags';
import { isPublished, publishedDivisions, visibilityFrom, type ResultsVisibility } from '@/lib/results-visibility';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import { fetchStandings, type Division, type DivisionStandings, type StandingRow } from '@/lib/standings';
import { contest, competition, monthDay, bannerLine } from '@/contest.config';
import { formatSummary } from '@/lib/divisions-core';
import { DIVISION_PLAYLIST_URLS, LIVESTREAM_URL, WINNERS_PLAYLIST_URL } from '@/lib/contest-videos';

// Public results are gated by the results_published flag (admin toggle, env fallback) or, per
// division and round, by Publish results on the admin schedule (lib/results-visibility.ts).

async function getStandings(): Promise<Record<Division, DivisionStandings>> {
  return fetchStandings(createAdminClient());
}

/** Which results are public. Without database credentials (e.g. a CI build), only the global flag counts. */
async function getVisibility(): Promise<ResultsVisibility> {
  try {
    return await publishedDivisions(createAdminClient());
  } catch (e) {
    console.error('[results] visibility check failed:', e);
    return visibilityFrom(await getEventFlagBoolean('results_published', process.env.RESULTS_PUBLISHED === 'true'), []);
  }
}

// Refresh at most once per minute once published.
export const revalidate = 60;

const PLACE_COLORS = ['var(--gold)', '#c7c7d1', '#cd7f32']; // 1st gold · 2nd silver · 3rd bronze

const subHeading = { fontSize: '0.65rem', letterSpacing: '0.12em', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', margin: '0 0 0.5rem' } as const;

/** One ranked list: place, name, location, the formatted value and an optional detail line. */
function StandingsList({ rows, label }: { rows: StandingRow[]; label: string }) {
  if (rows.length === 0) {
    return (
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0, paddingLeft: '1rem' }}>
        No results yet.
      </p>
    );
  }
  return (
    <ol aria-label={label} style={{ listStyle: 'none', margin: 0, padding: 0, border: '1px solid var(--navy-border)' }}>
      {rows.map((c, i) => {
        const top = c.place === 1;
        const placeColor = c.place <= 3 ? PLACE_COLORS[c.place - 1] : 'var(--text-muted)';
        return (
          <li
            key={c.registration_id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              padding: '0.85rem 1rem',
              borderBottom: i < rows.length - 1 ? '1px solid var(--navy-border)' : 'none',
              background: top ? '#1a1400' : i % 2 === 0 ? 'var(--navy)' : 'transparent',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minWidth: 0 }}>
              <span
                aria-label={`Place ${c.place}`}
                style={{ width: '1.75rem', flexShrink: 0, textAlign: 'center', fontSize: '0.95rem', fontWeight: 800, color: placeColor }}
              >
                {c.place}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: top ? 'var(--gold)' : '#fff', overflow: 'hidden', textOverflow: 'ellipsis', overflowWrap: 'anywhere' }}>
                  {c.display_name}
                </div>
                {(c.city || c.state) && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {[c.city, c.state].filter(Boolean).join(', ')}
                  </div>
                )}
              </div>
            </div>
            <div style={{ flexShrink: 0, textAlign: 'right' }}>
              <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.05rem', color: top ? 'var(--gold)' : '#fff', whiteSpace: 'nowrap' }}>
                {c.value_label}
              </div>
              {c.detail && (
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap' }}>{c.detail}</div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default async function ResultsPage() {
  const vis = await getVisibility();
  const resultsPublished = vis.all;
  // Divisions with at least one released round, in config order.
  const shown = competition.divisions.filter((d) => isPublished(vis, d.code));
  const standings = shown.length ? await getStandings() : null;
  const total = standings
    ? shown.reduce((n, d) => n + (standings[d.code]?.final.length ?? 0), 0)
    : 0;

  return (
    <>
      <NavBar />
      <main id="main-content" style={{ maxWidth: 820, margin: '0 auto', padding: '3rem 1.5rem', minHeight: '60vh' }}>
        <header style={{ marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '0.6rem', letterSpacing: '0.18em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.5rem' }}>
            {contest.shortName} · {bannerLine}
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", color: '#fff', fontSize: '2rem', margin: '0 0 0.5rem' }}>
            Contest Results
          </h1>
          <p style={{ color: 'var(--text-body)', margin: 0 }}>
            {!shown.length
              ? 'Final standings will be posted here after the contest.'
              : total === 0
                ? 'Results are being finalized. Check back shortly.'
                : resultsPublished
                  ? 'Final standings for every division.'
                  : 'Results so far. More divisions post here as judging wraps up.'}
          </p>
          {resultsPublished && (
            <p style={{ color: 'var(--text-body)', margin: '0.5rem 0 0' }}>
              <a href={contest.links.results} style={{ color: 'var(--gold-light)' }}>Podium recap, Virginia State Champions, and contest stats →</a>
            </p>
          )}
          <p style={{ color: 'var(--text-body)', margin: '0.5rem 0 0' }}>
            <a href="/results/run-order" style={{ color: 'var(--gold-light)' }}>See who&rsquo;s up next in the live run order →</a>
            {' · '}
            <a href="/schedule" style={{ color: 'var(--gold-light)' }}>Live schedule →</a>
          </p>
          {(WINNERS_PLAYLIST_URL || LIVESTREAM_URL) && (
            <p style={{ color: 'var(--text-body)', margin: '0.5rem 0 0' }}>
              {WINNERS_PLAYLIST_URL && (
                <a href={WINNERS_PLAYLIST_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold-light)' }}>Watch the winners playlist →</a>
              )}
              {WINNERS_PLAYLIST_URL && LIVESTREAM_URL && ' · '}
              {LIVESTREAM_URL && (
                <a href={LIVESTREAM_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold-light)' }}>Full livestream replay →</a>
              )}
            </p>
          )}
        </header>

        {!standings ? (
          <section style={{ border: '1px solid var(--navy-border)', background: 'var(--navy)', padding: '2.5rem 1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🏆</div>
            <p style={{ color: '#fff', fontWeight: 700, margin: '0 0 0.5rem' }}>
              Results drop right after the contest.
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
              Competing on {monthDay()}? See who&rsquo;s registered on the{' '}
              <a href="/directory" style={{ color: 'var(--gold-light)' }}>directory page</a>.
            </p>
          </section>
        ) : (
          shown.map((d) => {
            const code = d.code;
            const full = standings[code];
            if (!full) return null;
            // Released rounds only; the overall order waits for the last round's release.
            const rounds = full.rounds.filter((_, i) => isPublished(vis, code, i + 1));
            const finalOut = full.rounds.length <= 1 || isPublished(vis, code, full.rounds.length);
            const ds = { ...full, rounds, final: finalOut ? full.final : [] };
            const multiRound = full.rounds.length > 1;
            return (
              <section key={code} aria-labelledby={`div-${code}`} style={{ marginBottom: '2.5rem' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0.25rem 0.75rem', marginBottom: '0.35rem' }}>
                  <h2 id={`div-${code}`} style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.2rem', margin: 0 }}>
                    {d.name}
                  </h2>
                  {ds.format !== 'showcase' && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      {ds.final.length} placed
                    </span>
                  )}
                  {DIVISION_PLAYLIST_URLS[code] && (
                    <a
                      href={DIVISION_PLAYLIST_URLS[code]}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 700, color: 'var(--gold-light)' }}
                    >
                      Watch the runs →
                    </a>
                  )}
                </div>
                {ds.format !== 'showcase' && (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '0 0 1rem' }}>{formatSummary(d)}</p>
                )}

                {ds.format === 'showcase' ? (
                  <p style={{ color: 'var(--text-body)', fontSize: '0.85rem', margin: '0.5rem 0 0', paddingLeft: '1rem' }}>
                    Showcase — not judged.
                  </p>
                ) : (
                  <>
                    {multiRound && finalOut && <h3 style={subHeading}>Final standings</h3>}
                    {finalOut && <StandingsList rows={ds.final} label={`${d.name} standings`} />}
                    {ds.format === 'bracket' && (
                      <p style={{ margin: '0.6rem 0 0', fontSize: '0.8rem' }}>
                        <a href={`/results/bracket?division=${encodeURIComponent(code)}`} style={{ color: 'var(--gold-light)', fontWeight: 700 }}>
                          View bracket →
                        </a>
                      </p>
                    )}
                    {multiRound && ds.rounds.map((r) => (
                      <details key={r.name} style={{ marginTop: '0.9rem' }}>
                        <summary style={{ ...subHeading, cursor: 'pointer', margin: 0, padding: '0.25rem 0' }}>
                          {r.name} ({r.rows.length})
                        </summary>
                        <div style={{ marginTop: '0.5rem' }}>
                          <StandingsList rows={r.rows} label={`${d.name} ${r.name}`} />
                        </div>
                      </details>
                    ))}
                  </>
                )}
              </section>
            );
          })
        )}

        <footer style={{ borderTop: '1px solid var(--navy-border)', paddingTop: '1.5rem', marginTop: '1rem' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
            Scores are out of 100 and averaged across all judges. 1A and X: 60 technical execution (clickers) + 40 evaluation, minus
            major deductions (stop −1, discard −3, detach −5). Sport / Beginner / Junior: 20 technical execution + 80 evaluation, with no
            negative clicks or deductions. Each judge&rsquo;s top clicker score is normalized to the full 60 (or 20).{' '}
            <a href="https://dmvthrowers.club/vsyc26-rules.html#scoring" style={{ color: 'var(--gold-light)' }}>How scoring worked</a>
            {' · '}
            <a href="https://yoyocontest.com/freestyle-rules-for-nyyl-events/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold-light)' }}>Source: NYYL freestyle rules</a>
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
            Questions about results?{' '}
            <a href={`mailto:${contest.contactEmail}`} style={{ color: 'var(--gold-light)' }}>{contest.contactEmail}</a>
          </p>
        </footer>
      </main>
      <Footer />
    </>
  );
}
