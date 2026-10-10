import { notFound } from 'next/navigation';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import { contest, competition, bannerLine } from '@/contest.config';

// Static: the lists come from contest.config.ts → competition.divisions (ladder divisions).
export default function TricksPage() {
  const ladders = competition.divisions.flatMap((d) => (d.scoring.format === 'ladder' ? [{ d, s: d.scoring }] : []));
  if (ladders.length === 0) notFound();

  return (
    <>
      <NavBar />
      <main id="main-content" style={{ maxWidth: 820, margin: '0 auto', padding: '3rem 1.5rem', minHeight: '60vh' }}>
        <header style={{ marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '0.6rem', letterSpacing: '0.18em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.5rem' }}>
            {contest.shortName} · {bannerLine}
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", color: '#fff', fontSize: '2rem', margin: '0 0 0.5rem' }}>Trick Lists</h1>
          <p style={{ color: 'var(--text-body)', margin: 0 }}>Practice these before the day. The order below is the order you play them.</p>
        </header>

        {ladders.map(({ d, s }) => {
          const byPoints = s.rankBy === 'points';
          return (
            <section key={d.code} aria-labelledby={`t-${d.code}`} style={{ marginBottom: '2.5rem' }}>
              <h2 id={`t-${d.code}`} style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.2rem', margin: '0 0 0.35rem' }}>{d.name}</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
                {byPoints
                  ? `You try every trick, ${s.attemptsPerTrick} ${s.attemptsPerTrick === 1 ? 'try' : 'tries'} each. Each one you land earns its points.`
                  : `${s.attemptsPerTrick} ${s.attemptsPerTrick === 1 ? 'try' : 'tries'} at each trick. Land one to move up a rung; miss every try and you stop there.`}
              </p>
              <ol style={{ margin: 0, paddingLeft: '1.6rem', color: 'var(--text-body)', border: '1px solid var(--navy-border)', background: 'var(--navy)' }}>
                {s.tricks.map((t, i) => (
                  <li key={`${t.name}-${i}`} style={{ padding: '0.6rem 1rem 0.6rem 0.4rem', borderTop: i ? '1px solid var(--navy-border)' : 'none' }}>
                    <strong style={{ color: '#fff' }}>{t.name}</strong>
                    {byPoints && t.points !== undefined && <span style={{ color: 'var(--text-muted)' }}> · {t.points} {t.points === 1 ? 'point' : 'points'}</span>}
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </main>
      <Footer />
    </>
  );
}
