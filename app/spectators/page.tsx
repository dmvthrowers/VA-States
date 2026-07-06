import Link from 'next/link';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';

interface PublicProfile {
  id: string;
  role: string;
  display_name: string;
  pronouns: string | null;
  bio: string | null;
  state: string | null;
  team: string | null;
  photo_url: string | null;
}

const roleLabel: Record<string, string> = {
  competitor: 'Competitor',
  spectator: 'Spectator',
  judge: 'Judge',
  dj: 'DJ',
  audio_tech: 'Audio Tech',
  admin: 'Staff',
};

async function getPublicProfiles(): Promise<PublicProfile[]> {
  if (!hasAdminCredentials()) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('vsyc_public_profiles')
    .select('id, role, display_name, pronouns, bio, state, team, photo_url')
    .order('display_name', { ascending: true });

  if (error || !data) return [];

  return data as PublicProfile[];
}

export const revalidate = 300;

export default async function SpectatorsPage() {
  const profiles = await getPublicProfiles();

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
            {profiles.length === 0
              ? 'RSVPs are open — spectating is always free.'
              : `${profiles.length} public profile${profiles.length === 1 ? '' : 's'} listed.`}
          </p>
        </header>

        {profiles.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No public RSVPs yet.</p>
        ) : (
          <div style={{ border: '1px solid var(--navy-border)' }}>
            {profiles.map((p, i) => (
              <div
                key={`${p.role}-${p.id}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  borderBottom: i < profiles.length - 1 ? '1px solid var(--navy-border)' : 'none',
                  background: i % 2 === 0 ? 'var(--navy)' : 'transparent',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>{p.display_name}</span>
                    <span style={{ fontSize: '0.65rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold)' }}>{roleLabel[p.role] ?? p.role}</span>
                    {p.pronouns && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>({p.pronouns})</span>}
                  </div>
                  {p.team && <div style={{ fontSize: '0.7rem', color: 'var(--gold)' }}>{p.team}</div>}
                  {p.bio && <div style={{ fontSize: '0.75rem', color: 'var(--text-body)', marginTop: '0.2rem' }}>{p.bio}</div>}
                </div>
                {p.state && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.state}</span>}
              </div>
            ))}
          </div>
        )}

        <footer style={{ borderTop: '1px solid var(--navy-border)', paddingTop: '1.5rem', marginTop: '2.5rem' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
            List shows public profiles only — competitors, spectators, judges, and staff can opt in. Free to attend, all ages.{' '}
            <Link href="/spectate" style={{ color: 'var(--gold-light)' }}>RSVP now →</Link>
          </p>
        </footer>
      </main>
      <Footer />
    </>
  );
}
