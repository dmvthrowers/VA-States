'use client';

import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import { ScheduleList, StageCard, clock, useScheduleFeed } from '@/components/ScheduleView';
import { contest, bannerLine } from '@/contest.config';

/**
 * Public live schedule (docs/FORMATS.md → Live schedule). Times move as the day runs: each
 * block starts when the one before it really ends, and fixed blocks stay put. Refreshes every 15s.
 */
export default function SchedulePage() {
  const { feed, error } = useScheduleFeed('/api/schedule');
  const live = feed?.now_items ?? [];
  return (
    <>
      <NavBar />
      <main id="main-content" style={{ maxWidth: 820, margin: '0 auto', padding: '3rem 1.5rem', minHeight: '60vh' }}>
        <header style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: '0.6rem', letterSpacing: '0.18em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.5rem' }}>
            {contest.shortName} · {bannerLine}
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", color: '#fff', fontSize: '2rem', margin: '0 0 0.5rem' }}>Live Schedule</h1>
          <p style={{ color: 'var(--text-body)', margin: 0 }}>
            Times update as each division runs. Results post here the moment judging wraps up.
          </p>
          <p style={{ color: 'var(--text-body)', margin: '0.5rem 0 0' }}>
            <a href="/results/run-order" style={{ color: 'var(--gold-light)' }}>Full run order →</a>
            {' · '}
            <a href="/results" style={{ color: 'var(--gold-light)' }}>Results →</a>
            {' · '}
            <a href="/side-events" style={{ color: 'var(--gold-light)' }}>Side events →</a>
          </p>
        </header>

        {error && !feed && <p role="alert" style={{ color: '#ff6b6b' }}>The schedule didn&rsquo;t load. It&rsquo;ll try again in a few seconds.</p>}
        {!feed && !error && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}

        {feed && (
          <>
            <section aria-label="Happening now" style={{ marginBottom: '2rem' }}>
              {live.length === 0 ? (
                feed.next && (
                  <div style={{ border: '1px solid var(--navy-border)', background: 'var(--navy)', padding: '1.25rem' }}>
                    <div style={{ fontSize: '0.6rem', letterSpacing: '0.16em', fontWeight: 800, color: 'var(--gold)' }}>UP NEXT</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff' }}>{feed.next.title}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>About {clock(feed.next.est_start, feed.timeZone)}</div>
                  </div>
                )
              ) : live.map((n) => (
                <div key={n.id} style={{ border: '1px solid var(--red)', background: 'var(--navy)', padding: '1.25rem', marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.6rem', letterSpacing: '0.16em', fontWeight: 800, color: 'var(--red)' }}>
                    {n.status === 'judging' ? 'JUDGES ARE SCORING' : 'LIVE NOW'}
                  </div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff' }}>{n.title}</div>
                  {n.run_order && n.status === 'live' && <StageCard ro={n.run_order} />}
                </div>
              ))}
            </section>
            <ScheduleList feed={feed} />
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.75rem' }}>
              All times {feed.timeZone.replace(/_/g, ' ')}. Estimates. Arrive early for your division.
            </p>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
