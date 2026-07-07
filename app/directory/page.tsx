import Link from 'next/link';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import DirectoryClient, { type DirectoryProfile } from '@/components/DirectoryClient';

async function getPublicProfiles(): Promise<DirectoryProfile[]> {
  if (!hasAdminCredentials()) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('vsyc_public_profiles')
    .select('id, role, display_name, pronouns, city, state, club, team, bio, divisions')
    .order('display_name', { ascending: true });

  if (error || !data) return [];

  return data as DirectoryProfile[];
}

export const revalidate = 300; // ISR — refresh at most once per 5 minutes

export default async function DirectoryPage() {
  const profiles = await getPublicProfiles();

  return (
    <>
      <NavBar />
      <main id="main-content" style={{ maxWidth: 800, margin: '0 auto', padding: '3rem 1.5rem', minHeight: '60vh' }}>
        <header style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: '0.6rem', letterSpacing: '0.18em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.5rem' }}>
            VSYC-26 · SEPT 19, 2026
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", color: '#fff', fontSize: '2rem', margin: '0 0 0.5rem' }}>
            Directory
          </h1>
          <p style={{ color: 'var(--text-body)', margin: 0 }}>
            Competitors, spectators, judges, and staff who&rsquo;ve opted in to appear publicly. Search and filter below.
          </p>
        </header>

        <DirectoryClient profiles={profiles} />

        <footer style={{ borderTop: '1px solid var(--navy-border)', paddingTop: '1.5rem', marginTop: '2.5rem' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
            Public listing is opt-in — anyone can choose to appear or stay private. Updated every 5 minutes.{' '}
            <Link href="/" style={{ color: 'var(--gold-light)' }}>Register to compete →</Link>{' '}
            · <Link href="/spectate" style={{ color: 'var(--gold-light)' }}>RSVP to spectate →</Link>
          </p>
        </footer>
      </main>
      <Footer />
    </>
  );
}
