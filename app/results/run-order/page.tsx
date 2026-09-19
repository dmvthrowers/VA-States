import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import RunOrderBoard from '@/components/RunOrderBoard';

export const metadata = {
  title: 'Run Order — VSYC-26 Results',
};

export default function RunOrderPage() {
  return (
    <>
      <NavBar />
      <main id="main-content" style={{ maxWidth: 820, margin: '0 auto', padding: '3rem 1.5rem', minHeight: '60vh' }}>
        <header style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: '0.6rem', letterSpacing: '0.18em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.5rem' }}>
            VSYC-26 · SEPT 19, 2026 · DULLES TOWN CENTER
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", color: '#fff', fontSize: '2rem', margin: '0 0 0.5rem' }}>
            Run Order
          </h1>
          <p style={{ color: 'var(--text-body)', margin: 0 }}>
            Who&rsquo;s up next in each division, straight from the day-of run order. Refreshes
            automatically as staff update it.{' '}
            <strong style={{ color: '#fff' }}>
              One round per division — there are no prelims. Every competitor performs once, and
              placements come from that round.
            </strong>{' '}
            <a href="/results" style={{ color: 'var(--gold-light)' }}>View final results →</a>
          </p>
        </header>

        <RunOrderBoard />

        <footer style={{ borderTop: '1px solid var(--navy-border)', paddingTop: '1.5rem', marginTop: '2.5rem' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
            Questions about scheduling?{' '}
            <a href="mailto:dmvthrowers@gmail.com" style={{ color: 'var(--gold-light)' }}>dmvthrowers@gmail.com</a>
          </p>
        </footer>
      </main>
      <Footer />
    </>
  );
}
