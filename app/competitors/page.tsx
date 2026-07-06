import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';

interface Competitor {
  registration_id: string;
  display_name: string;
  city: string | null;
  state: string | null;
}

const DIVISIONS: { code: string; label: string }[] = [
  { code: '1A', label: '1A — Single String' },
  { code: 'X',  label: 'X Division' },
  { code: 'SBJ', label: 'Sport / Beginner / Junior' },
];

async function getCompetitors(): Promise<Record<string, Competitor[]>> {
  // Don't crash env-less builds (CI/local) — render an empty list instead.
  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch {
    return {};
  }

  const { data, error } = await supabase
    .from('vsyc_registrations')
    .select('id, first_name, last_name, preferred_bracket_name, city, state, divisions')
    .eq('paid', true)
    .order('created_at', { ascending: true });

  if (error || !data) return {};

  const grouped: Record<string, Competitor[]> = { '1A': [], X: [], SBJ: [] };

  for (const reg of data) {
    const entry: Competitor = {
      registration_id: reg.id,
      display_name: reg.preferred_bracket_name ?? `${reg.first_name} ${reg.last_name}`,
      city: reg.city ?? null,
      state: reg.state ?? null,
    };
    for (const div of reg.divisions as string[]) {
      if (grouped[div]) grouped[div].push(entry);
    }
  }

  return grouped;
}

export const revalidate = 60; // ISR — refresh at most once per minute

export default async function CompetitorsPage() {
  const byDivision = await getCompetitors();
  const total = Object.values(byDivision).reduce((s, arr) => s + arr.length, 0);

  return (
    <>
      <NavBar />
      <main id="main-content" style={{ maxWidth: 800, margin: '0 auto', padding: '3rem 1.5rem', minHeight: '60vh' }}>
        <header style={{ marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '0.6rem', letterSpacing: '0.18em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.5rem' }}>
            VSYC-26 · SEPT 19, 2026
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", color: '#fff', fontSize: '2rem', margin: '0 0 0.5rem' }}>
            Registered Competitors
          </h1>
          <p style={{ color: 'var(--text-body)', margin: 0 }}>
            {total === 0
              ? 'Registration is open — be the first to sign up.'
              : `${total} competitor${total === 1 ? '' : 's'} registered across all divisions.`}
          </p>
        </header>

        {DIVISIONS.map(({ code, label }) => {
          const competitors = byDivision[code] ?? [];
          return (
            <section key={code} style={{ marginBottom: '2.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '1rem' }}>
                <h2 style={{
                  fontFamily: "'Playfair Display', serif",
                  color: 'var(--gold)',
                  fontSize: '1.2rem',
                  margin: 0,
                }}>
                  {label}
                </h2>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  {competitors.length} registered
                </span>
              </div>

              {competitors.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0, paddingLeft: '1rem' }}>
                  No competitors registered yet.
                </p>
              ) : (
                <div style={{ border: '1px solid var(--navy-border)' }}>
                  {competitors.map((c, i) => (
                    <div
                      key={c.registration_id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.75rem 1rem',
                        borderBottom: i < competitors.length - 1 ? '1px solid var(--navy-border)' : 'none',
                        background: i % 2 === 0 ? 'var(--navy)' : 'transparent',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{
                          width: '1.5rem',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          color: 'var(--text-muted)',
                          textAlign: 'right',
                          flexShrink: 0,
                        }}>
                          {i + 1}
                        </span>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>
                          {c.display_name}
                        </span>
                      </div>
                      {(c.city || c.state) && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {[c.city, c.state].filter(Boolean).join(', ')}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}

        <footer style={{ borderTop: '1px solid var(--navy-border)', paddingTop: '1.5rem', marginTop: '1rem' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
            List shows paid registrants only. Updated every 60 seconds.{' '}
            Run order will be published closer to the event.{' '}
            <Link href="/" style={{ color: 'var(--gold-light)' }}>Register now →</Link>
          </p>
        </footer>
      </main>
      <Footer />
    </>
  );
}
