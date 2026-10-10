import Link from 'next/link';
import { notFound } from 'next/navigation';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import LocalDeadline from '@/components/LocalDeadline';
import { contest, competition, dayOf, bannerLine, longDate, venueLine, deadlineLabel } from '@/contest.config';
import { entryOf, formatSummary, roundsOf, routineSecondsOf } from '@/lib/divisions-core';
import { displayPrice } from '@/lib/pricing';
import { clockLabel, routineLabel } from '@/lib/contest-guide';

// Static: everything comes from contest.config.ts.
export default function GuidePage() {
  if (!contest.guide.enabled) notFound();
  const h2 = { fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.2rem', margin: '0 0 0.75rem' } as const;
  const body = { color: 'var(--text-body)' } as const;
  const starters = competition.divisions.filter((d) => d.beginnerFriendly);
  const timed = dayOf.schedule;

  return (
    <>
      <NavBar />
      <main id="main-content" style={{ maxWidth: 820, margin: '0 auto', padding: '3rem 1.5rem', minHeight: '60vh' }}>
        <header style={{ marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '0.6rem', letterSpacing: '0.18em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.5rem' }}>
            {contest.shortName} · {bannerLine}
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", color: '#fff', fontSize: '2rem', margin: '0 0 0.5rem' }}>Contest Guide</h1>
          {contest.guide.intro && <p style={{ ...body, margin: 0 }}>{contest.guide.intro}</p>}
        </header>

        <section aria-labelledby="glance" style={{ marginBottom: '2.5rem' }}>
          <h2 id="glance" style={h2}>At a Glance</h2>
          <ul style={{ ...body, paddingLeft: '1.1rem', margin: 0 }}>
            <li><strong style={{ color: '#fff' }}>When:</strong> {longDate()}</li>
            <li><strong style={{ color: '#fff' }}>Where:</strong> {venueLine}</li>
            {contest.tagline && <li>{contest.tagline}</li>}
          </ul>
          <p style={{ margin: '0.75rem 0 0' }}>
            <Link href="/" style={{ color: 'var(--gold-light)', fontWeight: 700 }}>Register →</Link>
            {' · '}
            <a href="/fee-calculator" style={{ color: 'var(--gold-light)' }}>Fee calculator</a>
            {contest.links.rules && <>{' · '}<a href={contest.links.rules} style={{ color: 'var(--gold-light)' }}>Rules</a></>}
            {contest.links.faq && <>{' · '}<a href={contest.links.faq} style={{ color: 'var(--gold-light)' }}>FAQ</a></>}
          </p>
        </section>

        <section aria-labelledby="divisions" style={{ marginBottom: '2.5rem' }}>
          <h2 id="divisions" style={h2}>Divisions &amp; Fees</h2>
          <div className="table-wrap" style={{ overflowX: 'auto' }} tabIndex={0} role="region" aria-label="Divisions and fees">
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9rem', border: '1px solid var(--navy-border)' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '0.6rem 0.8rem' }}>Division</th>
                  <th scope="col" style={{ padding: '0.6rem 0.8rem' }}>Fee</th>
                  <th scope="col" style={{ padding: '0.6rem 0.8rem' }}>How it&rsquo;s judged</th>
                  <th scope="col" style={{ padding: '0.6rem 0.8rem' }}>Routine</th>
                </tr>
              </thead>
              <tbody>
                {competition.divisions.map((d) => {
                  const secs = roundsOf(d).map((_, i) => routineLabel(routineSecondsOf(d, i + 1)));
                  const routine = [...new Set(secs.filter(Boolean))].join(' / ') || 'Varies';
                  const team = entryOf(d);
                  return (
                    <tr key={d.code} style={{ borderTop: '1px solid var(--navy-border)', verticalAlign: 'top' }}>
                      <th scope="row" style={{ textAlign: 'left', padding: '0.6rem 0.8rem', color: '#fff' }}>
                        {d.name}
                        <div style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.8rem' }}>
                          {d.description}{team.type === 'team' ? ` Entered as a ${team.label.toLowerCase()} of ${team.min === team.max ? team.min : `${team.min}–${team.max}`}.` : ''}
                        </div>
                      </th>
                      <td style={{ padding: '0.6rem 0.8rem', ...body, whiteSpace: 'nowrap' }}>{displayPrice(d.priceCents)}</td>
                      <td style={{ padding: '0.6rem 0.8rem', ...body }}>{formatSummary(d)}</td>
                      <td style={{ padding: '0.6rem 0.8rem', ...body, whiteSpace: 'nowrap' }}>{routine}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {competition.pricing.earlyBirdDiscountCents > 0 && !competition.pricing.pricesTbd && (
            <p style={{ ...body, fontSize: '0.85rem', margin: '0.75rem 0 0' }}>
              Early-bird discount until {deadlineLabel(contest.deadlines.earlyBird)}. Walk-ups after online registration closes pay a late fee.
            </p>
          )}
        </section>

        <section aria-labelledby="deadlines" style={{ marginBottom: '2.5rem' }}>
          <h2 id="deadlines" style={h2}>Deadlines</h2>
          <ul style={{ ...body, paddingLeft: '1.1rem', margin: 0 }}>
            <li><strong style={{ color: '#fff' }}>Online registration closes:</strong> <LocalDeadline iso={contest.deadlines.onlineRegistration} venueZone={contest.timeZone} /></li>
            <li><strong style={{ color: '#fff' }}>Music upload closes:</strong> <LocalDeadline iso={contest.deadlines.musicUpload} venueZone={contest.timeZone} /></li>
          </ul>
        </section>

        <section aria-labelledby="first" style={{ marginBottom: '2.5rem' }}>
          <h2 id="first" style={h2}>Never Competed Before?</h2>
          <p style={{ ...body, margin: '0 0 0.75rem' }}>Most people here are new. You do not need to be good, just ready to try.</p>
          {starters.length > 0 && (
            <>
              <h3 style={{ color: '#fff', fontSize: '1rem', margin: '0 0 0.4rem' }}>Where to start</h3>
              <ul style={{ ...body, paddingLeft: '1.1rem', margin: '0 0 1rem' }}>
                {starters.map((d) => <li key={d.code}><strong style={{ color: '#fff' }}>{d.name}</strong>: {d.description}</li>)}
              </ul>
            </>
          )}
          {contest.guide.bring.length > 0 && (
            <>
              <h3 style={{ color: '#fff', fontSize: '1rem', margin: '0 0 0.4rem' }}>What to bring</h3>
              <ul style={{ ...body, paddingLeft: '1.1rem', margin: '0 0 1rem' }}>
                {contest.guide.bring.map((b) => <li key={b}>{b}</li>)}
              </ul>
            </>
          )}
          {timed.length > 0 && (
            <>
              <h3 style={{ color: '#fff', fontSize: '1rem', margin: '0 0 0.4rem' }}>How the day goes</h3>
              <ol style={{ ...body, paddingLeft: '1.1rem', margin: 0 }}>
                {timed.map((i) => <li key={i.id}>{clockLabel(i.start)}: {i.title}</li>)}
              </ol>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.5rem 0 0' }}>Times are planned. The <a href="/schedule" style={{ color: 'var(--gold-light)' }}>live schedule</a> moves with the day.</p>
            </>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
