import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import { PublicBracket } from '@/components/BracketView';
import { contest, competition, bannerLine } from '@/contest.config';
import { formatSummary } from '@/lib/divisions-core';

// Brackets run live during the event, so this page isn't gated on results_published.
// Names come from /api/bracket, which masks minors who aren't opted into public listing.

const BRACKET_DIVISIONS = competition.divisions.filter((d) => d.scoring.format === 'bracket');

export default async function BracketResultsPage({ searchParams }: { searchParams: Promise<{ division?: string }> }) {
  const sp = await searchParams;
  const current = BRACKET_DIVISIONS.find((d) => d.code === sp.division) ?? BRACKET_DIVISIONS[0];
  const scoring = current?.scoring.format === 'bracket' ? current.scoring : null;

  return (
    <>
      <NavBar />
      <main id="main-content" style={{ maxWidth: 1100, margin: '0 auto', padding: '3rem 1rem', minHeight: '60vh' }}>
        <header style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.6rem', letterSpacing: '0.18em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.5rem' }}>
            {contest.shortName} · {bannerLine}
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", color: '#fff', fontSize: '2rem', margin: '0 0 0.5rem' }}>
            {current ? current.name : 'Battle Brackets'}
          </h1>
          <p style={{ color: 'var(--text-body)', margin: 0 }}>
            {current
              ? <>{formatSummary(current)}. Updates live while a battle is on.{' '}</>
              : 'This contest has no battle divisions. '}
            <a href="/results" style={{ color: 'var(--gold-light)' }}>All results →</a>
          </p>
        </header>

        {BRACKET_DIVISIONS.length > 1 && (
          <nav aria-label="Battle divisions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            {BRACKET_DIVISIONS.map((d) => {
              const active = d.code === current?.code;
              return (
                <a key={d.code} href={`/results/bracket?division=${encodeURIComponent(d.code)}`} aria-current={active ? 'page' : undefined}
                  style={{ padding: '0.35rem 0.8rem', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.05em', textDecoration: 'none', color: '#fff', background: active ? 'var(--red)' : 'transparent', border: `1px solid ${active ? 'var(--red)' : 'var(--navy-border)'}` }}>
                  {d.name}
                </a>
              );
            })}
          </nav>
        )}

        {scoring && (scoring.matchFormat || scoring.rules?.length) ? (
          <section aria-label="Battle rules" style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '0.9rem 1rem', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.65rem', letterSpacing: '0.14em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.4rem' }}>RULES</div>
            <ul style={{ margin: 0, paddingLeft: '1.1rem', listStyle: 'disc', color: 'var(--text-body)', fontSize: '0.9rem' }}>
              {scoring.matchFormat && <li>Format: {scoring.matchFormat}</li>}
              {(scoring.rules ?? []).map((r) => <li key={r}>{r}</li>)}
            </ul>
          </section>
        ) : null}

        {current && <PublicBracket key={current.code} division={current.code} />}
      </main>
      <Footer />
    </>
  );
}
