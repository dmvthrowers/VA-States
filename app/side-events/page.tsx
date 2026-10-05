'use client';

import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import { SideLeaderboard, useSideEvents } from '@/components/SideEventBoard';
import { contest, bannerLine } from '@/contest.config';

/** Public side-event leaderboards (docs/FORMATS.md → Side events). Refreshes every 10s. */
export default function SideEventsPage() {
  const { events, error } = useSideEvents(null);
  return (
    <>
      <NavBar />
      <main id="main-content" style={{ maxWidth: 820, margin: '0 auto', padding: '3rem 1.5rem', minHeight: '60vh' }}>
        <header style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: '0.6rem', letterSpacing: '0.18em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.5rem' }}>
            {contest.shortName} · {bannerLine}
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", color: '#fff', fontSize: '2rem', margin: '0 0 0.5rem' }}>Side Events</h1>
          <p style={{ color: 'var(--text-body)', margin: 0 }}>
            Quick challenges between divisions. Anyone can try, no sign-up needed. Find the side table and give it a go.
          </p>
          <p style={{ margin: '0.5rem 0 0' }}>
            <a href="/schedule" style={{ color: 'var(--gold-light)' }}>Live schedule →</a>
          </p>
        </header>
        {error && !events && <p role="alert" style={{ color: '#ff6b6b' }}>The leaderboards didn&rsquo;t load. Trying again shortly.</p>}
        {!events && !error && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
        {events?.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No side events this year.</p>}
        {events?.map((ev) => (
          <section key={ev.code} aria-labelledby={`side-${ev.code}`} style={{ marginBottom: '2.5rem' }}>
            <h2 id={`side-${ev.code}`} style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.2rem', margin: '0 0 0.25rem' }}>{ev.name}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0 0 0.75rem' }}>
              {ev.description} {ev.people > 0 && `${ev.people} ${ev.people === 1 ? 'person' : 'people'}, ${ev.tries} ${ev.tries === 1 ? 'try' : 'tries'}.`}
            </p>
            <SideLeaderboard ev={ev} />
          </section>
        ))}
      </main>
      <Footer />
    </>
  );
}
