import { notFound } from 'next/navigation';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import { contest, competition, bannerLine } from '@/contest.config';
import { formatSummary } from '@/lib/divisions-core';
import { longDateOf } from '@/lib/rules-changelog';

// Static: the rules come from contest.config.ts.
export default function RulesPage() {
  const r = contest.rulesPage;
  if (!r.enabled) notFound();
  const heading = { fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.2rem', margin: '0 0 0.5rem' } as const;

  return (
    <>
      <NavBar />
      <main id="main-content" style={{ maxWidth: 820, margin: '0 auto', padding: '3rem 1.5rem', minHeight: '60vh' }}>
        <header style={{ marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '0.6rem', letterSpacing: '0.18em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.5rem' }}>
            {contest.shortName} · {bannerLine}
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", color: '#fff', fontSize: '2rem', margin: '0 0 0.5rem' }}>Rules &amp; Changes</h1>
          <p style={{ color: 'var(--text-body)', margin: 0 }}>
            Version {r.version}. First published {longDateOf(r.publishedOn)}. Every change is listed below with its date, so nothing surprises you on the day.
          </p>
          {contest.links.rules && (
            <p style={{ margin: '0.5rem 0 0' }}>
              <a href={contest.links.rules} style={{ color: 'var(--gold-light)' }}>Read the full rules →</a>
            </p>
          )}
        </header>

        <section aria-labelledby="divisions" style={{ marginBottom: '2.5rem' }}>
          <h2 id="divisions" style={heading}>Divisions &amp; Scoring</h2>
          <ul style={{ color: 'var(--text-body)', paddingLeft: '1.1rem', margin: 0 }}>
            {competition.divisions.map((d) => (
              <li key={d.code} style={{ marginBottom: '0.4rem' }}>
                <strong style={{ color: '#fff' }}>{d.name}</strong>: {formatSummary(d)}.
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="changes" style={{ marginBottom: '2.5rem' }}>
          <h2 id="changes" style={heading}>Changes</h2>
          {r.changes.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No changes yet.</p>
          ) : (
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, border: '1px solid var(--navy-border)' }}>
              {r.changes.map((c, i) => (
                <li key={c.version} style={{ padding: '0.9rem 1rem', borderTop: i ? '1px solid var(--navy-border)' : 'none' }}>
                  <div style={{ color: '#fff', fontWeight: 700 }}>
                    Version {c.version} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {longDateOf(c.date)}</span>
                  </div>
                  <ul style={{ color: 'var(--text-body)', margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
                    {c.summary.map((s) => <li key={s}>{s}</li>)}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
