import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import { getBudgetEntries, getBudgetSummary } from '@/lib/budget';

// Public, always-on transparency page — no event flag gate, since the whole
// point is showing fundraising progress live as sponsor/merch figures come in.
export const revalidate = 60;

function formatMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default async function BudgetPage() {
  const entries = await getBudgetEntries().catch(() => []);
  const summary = await getBudgetSummary(entries).catch(() => null);

  return (
    <>
      <NavBar />
      <main id="main-content" style={{ maxWidth: 820, margin: '0 auto', padding: '3rem 1.5rem', minHeight: '60vh' }}>
        <header style={{ marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '0.6rem', letterSpacing: '0.18em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.5rem' }}>
            VSYC-26 · SEPT 19, 2026 · DULLES TOWN CENTER
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", color: '#fff', fontSize: '2rem', margin: '0 0 0.5rem' }}>
            Budget &amp; Transparency
          </h1>
          <p style={{ color: 'var(--text-body)', margin: 0 }}>
            We&rsquo;re a volunteer-run club putting on a state championship. Here&rsquo;s where the money comes from
            and where it goes, updated as figures come in.
          </p>
        </header>

        {!summary ? (
          <section style={{ border: '1px solid var(--navy-border)', background: 'var(--navy)', padding: '2.5rem 1.5rem', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>Budget figures aren&rsquo;t available right now — check back shortly.</p>
          </section>
        ) : (
          <>
            <section style={{ border: '1px solid var(--navy-border)', background: 'var(--navy)', padding: '1.5rem', marginBottom: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-body)', marginBottom: '0.5rem' }}>
                <span>{formatMoney(summary.total_income_cents)} raised</span>
                <span>
                  {summary.goal_cents > 0
                    ? `${summary.progress_percent}% of ${formatMoney(summary.goal_cents)} goal`
                    : 'Goal not yet set'}
                </span>
              </div>
              <div style={{ width: '100%', height: 14, background: 'var(--navy-deep)', border: '1px solid var(--navy-border)' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(100, summary.progress_percent)}%`,
                    background: 'var(--gold)',
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>
            </section>

            <section style={{ marginBottom: '2.5rem' }}>
              <h2 style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.2rem', margin: '0 0 1rem' }}>
                Income
              </h2>
              <div style={{ border: '1px solid var(--navy-border)' }}>
                {[
                  ['Registration fees', summary.registration_income_cents],
                  ['Sponsorships & donations', summary.sponsor_income_cents],
                  ['Merchandise', summary.merch_income_cents],
                  ['Other', summary.other_income_cents],
                ].map(([label, cents], i) => (
                  <div
                    key={label as string}
                    style={{
                      display: 'flex', justifyContent: 'space-between', padding: '0.85rem 1rem',
                      borderBottom: i < 3 ? '1px solid var(--navy-border)' : 'none',
                      background: i % 2 === 0 ? 'var(--navy)' : 'transparent',
                    }}
                  >
                    <span style={{ color: 'var(--text-body)' }}>{label}</span>
                    <span style={{ color: '#fff', fontWeight: 700, fontFamily: 'monospace' }}>{formatMoney(cents as number)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.85rem 1rem', borderTop: '2px solid var(--gold)', background: '#1a1400' }}>
                  <span style={{ color: 'var(--gold)', fontWeight: 700 }}>Total income</span>
                  <span style={{ color: 'var(--gold)', fontWeight: 800, fontFamily: 'monospace' }}>{formatMoney(summary.total_income_cents)}</span>
                </div>
              </div>
            </section>

            <section style={{ marginBottom: '2.5rem' }}>
              <h2 style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.2rem', margin: '0 0 1rem' }}>
                Expenses
              </h2>
              <div style={{ border: '1px solid var(--navy-border)' }}>
                {[
                  ['Merchandise costs', summary.merch_expense_cents],
                  ['Venue, awards, insurance & other', summary.other_expense_cents],
                ].map(([label, cents], i) => (
                  <div
                    key={label as string}
                    style={{
                      display: 'flex', justifyContent: 'space-between', padding: '0.85rem 1rem',
                      borderBottom: i < 1 ? '1px solid var(--navy-border)' : 'none',
                      background: i % 2 === 0 ? 'var(--navy)' : 'transparent',
                    }}
                  >
                    <span style={{ color: 'var(--text-body)' }}>{label}</span>
                    <span style={{ color: '#fff', fontWeight: 700, fontFamily: 'monospace' }}>{formatMoney(cents as number)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.85rem 1rem', borderTop: '2px solid var(--navy-border)', background: 'var(--navy-deep)' }}>
                  <span style={{ color: '#fff', fontWeight: 700 }}>Total expenses</span>
                  <span style={{ color: '#fff', fontWeight: 800, fontFamily: 'monospace' }}>{formatMoney(summary.total_expense_cents)}</span>
                </div>
              </div>
            </section>

            <section style={{ border: '1px solid var(--navy-border)', background: 'var(--navy)', padding: '1.25rem 1.5rem', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-body)', fontWeight: 700 }}>Net position</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.2rem', color: summary.net_cents >= 0 ? '#7fff7f' : '#ff6b6b' }}>
                {summary.net_cents >= 0 ? '+' : '−'}{formatMoney(Math.abs(summary.net_cents))}
              </span>
            </section>
          </>
        )}

        <footer style={{ borderTop: '1px solid var(--navy-border)', paddingTop: '1.5rem', marginTop: '1rem' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
            Figures are updated by event organizers as funds come in and bills are paid. Questions?{' '}
            <a href="mailto:dmvthrowers@gmail.com" style={{ color: 'var(--gold-light)' }}>dmvthrowers@gmail.com</a>
          </p>
        </footer>
      </main>
      <Footer />
    </>
  );
}
