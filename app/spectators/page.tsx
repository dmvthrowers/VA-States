import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';

interface Spectator {
  id: string;
  display_name: string;
  state: string | null;
  team: string | null;
}

async function getPublicSpectators(): Promise<Spectator[]> {
  if (!hasAdminCredentials()) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('vsyc_spectators')
    .select('id, first_name, last_name, nickname, state, team')
    .eq('is_public', true)
    .order('created_at', { ascending: true });

  if (error || !data) return [];

  return data.map((s) => ({
    id: s.id,
    display_name: s.nickname ?? `${s.first_name} ${s.last_name}`,
    state: s.state ?? null,
    team: s.team ?? null,
  }));
}

export const revalidate = 60;

export default async function SpectatorsPage() {
  const spectators = await getPublicSpectators();

  return (
    <>
      <NavBar />
      <main id="main-content" style={{ maxWidth: 800, margin: '0 auto', padding: '3rem 1.5rem', minHeight: '60vh' }}>
        <header style={{ marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '0.6rem', letterSpacing: '0.18em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.5rem' }}>
            VSYC-26 · SEPT 19, 2026
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", color: '#fff', fontSize: '2rem', margin: '0 0 0.5rem' }}>
            Who&apos;s Coming
          </h1>
          <p style={{ color: 'var(--text-body)', margin: 0 }}>
            {spectators.length === 0
              ? 'RSVPs are open — spectating is always free.'
              : `${spectators.length} spectator${spectators.length === 1 ? '' : 's'} on the public list.`}
          </p>
        </header>

        {spectators.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No public RSVPs yet.</p>
        ) : (
          <div style={{ border: '1px solid var(--navy-border)' }}>
            {spectators.map((s, i) => (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                  borderBottom: i < spectators.length - 1 ? '1px solid var(--navy-border)' : 'none',
                  background: i % 2 === 0 ? 'var(--navy)' : 'transparent',
                }}
              >
                <div>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>{s.display_name}</span>
                  {s.team && <div style={{ fontSize: '0.7rem', color: 'var(--gold)' }}>{s.team}</div>}
                </div>
                {s.state && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.state}</span>}
              </div>
            ))}
          </div>
        )}

        <footer style={{ borderTop: '1px solid var(--navy-border)', paddingTop: '1.5rem', marginTop: '2.5rem' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
            List shows public RSVPs only — spectators can opt to stay private. Free to attend, all ages.{' '}
            <a href="/spectate" style={{ color: 'var(--gold-light)' }}>RSVP now →</a>
          </p>
        </footer>
      </main>
      <Footer />
    </>
  );
}
