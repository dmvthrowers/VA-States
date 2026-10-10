import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import { contest, competition, bannerLine } from '@/contest.config';
import { prizeTable } from '@/lib/prize-table';

// Static: the prizes come from contest.config.ts (contest.prizes and each division's prizes).
export default function PrizesPage() {
  const rows = prizeTable(competition.divisions, { places: contest.prizes.places, championState: contest.stateChampion.state });

  return (
    <>
      <NavBar />
      <main id="main-content" style={{ maxWidth: 820, margin: '0 auto', padding: '3rem 1.5rem', minHeight: '60vh' }}>
        <header style={{ marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '0.6rem', letterSpacing: '0.18em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.5rem' }}>
            {contest.shortName} · {bannerLine}
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", color: '#fff', fontSize: '2rem', margin: '0 0 0.5rem' }}>Prizes</h1>
          <p style={{ color: 'var(--text-body)', margin: 0 }}>
            What each division awards. Some divisions give more prizes when more people enter.
            {contest.stateChampion.state && ` The ${contest.stateChampion.title} gets a prize on top of the podium.`}
          </p>
        </header>

        <div className="table-wrap" style={{ overflowX: 'auto' }} tabIndex={0} role="region" aria-label="Prizes by division">
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9rem', border: '1px solid var(--navy-border)' }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'left' }}>
                <th scope="col" style={{ padding: '0.6rem 0.8rem' }}>Division</th>
                <th scope="col" style={{ padding: '0.6rem 0.8rem' }}>Prizes</th>
                {contest.stateChampion.state && <th scope="col" style={{ padding: '0.6rem 0.8rem' }}>{contest.stateChampion.title}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} style={{ borderTop: '1px solid var(--navy-border)', verticalAlign: 'top' }}>
                  <th scope="row" style={{ textAlign: 'left', padding: '0.6rem 0.8rem', color: '#fff' }}>{r.name}</th>
                  <td style={{ padding: '0.6rem 0.8rem', color: 'var(--text-body)' }}>
                    {r.lines.map((l) => <div key={l}>{l}</div>)}
                  </td>
                  {contest.stateChampion.state && <td style={{ padding: '0.6rem 0.8rem', color: 'var(--text-body)' }}>{r.champion ? 'Yes' : 'No'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '1rem 0 0' }}>
          Ties share a place. Questions? <a href={`mailto:${contest.contactEmail}`} style={{ color: 'var(--gold-light)' }}>{contest.contactEmail}</a>
        </p>
      </main>
      <Footer />
    </>
  );
}
