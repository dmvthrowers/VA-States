import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';

const portals = [
  {
    title: 'Contestant Login Portal',
    description: 'Sign in to manage registration details, payment status, and music upload access.',
    href: '/player',
    cta: 'Open contestant portal',
  },
  {
    title: 'Music Upload (Competitors)',
    description: 'Upload or replace your music track from your secure competitor portal account.',
    href: '/player',
    cta: 'Go to music upload access',
  },
  {
    title: 'Spectator Manage RSVP',
    description: 'Use magic-link login to update your spectator RSVP and public profile settings.',
    href: '/spectators/portal',
    cta: 'Manage spectator RSVP',
  },
];

export default function PortalAccessPage() {
  return (
    <>
      <NavBar />
      <main id="main-content" className="max-w-5xl mx-auto px-4 py-10">
        <div className="mb-8">
          <span className="inline-block bg-gold text-navy-deep text-xs font-black tracking-widest px-3 py-1 mb-3">VSYC-26</span>
          <h1 className="font-display font-black text-4xl text-gold mb-2">Portal Access</h1>
          <p className="text-sm text-text-body">Use the correct portal for your role on event day and during prep. Judges, DJs, and event admins: head to <a href="/staff" className="text-gold-light underline">Staff Portals</a> instead.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {portals.map((portal) => (
            <section key={portal.title} className="border border-navy-border bg-navy p-5">
              <h2 className="font-display font-bold text-2xl text-white mb-2">{portal.title}</h2>
              <p className="text-sm text-text-body mb-5">{portal.description}</p>
              <a
                href={portal.href}
                className="inline-block bg-gold text-navy-deep font-black tracking-caps px-4 py-2 text-xs"
              >
                {portal.cta} →
              </a>
            </section>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
