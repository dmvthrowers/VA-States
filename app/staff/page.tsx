import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';

const portals = [
  {
    title: 'Staff Profile',
    description: 'Judges and staff can manage public bio/pronouns and choose whether to appear on the public directory.',
    href: '/staff/profile',
    cta: 'Edit staff profile',
  },
  {
    title: 'Judge Login',
    description: 'Judge scoring access with your assigned staff email and password.',
    href: '/judge',
    cta: 'Open judge login',
  },
  {
    title: 'DJ Login',
    description: 'DJ/audio staff login with assigned account credentials for secure music access.',
    href: '/dj',
    cta: 'Open DJ login',
  },
  {
    title: 'Admin Dashboard',
    description: 'Secure event-ops dashboard for staff admins to manage contestants, spectators, and live controls.',
    href: '/admin-dashboard',
    cta: 'Open admin dashboard',
  },
];

export default function StaffPortalsPage() {
  return (
    <>
      <NavBar />
      <main id="main-content" className="max-w-5xl mx-auto px-4 py-10">
        <div className="mb-8">
          <span className="inline-block bg-gold text-navy-deep text-xs font-black tracking-widest px-3 py-1 mb-3">VSYC-26</span>
          <h1 className="font-display font-black text-4xl text-gold mb-2">Staff Portals</h1>
          <p className="text-sm text-text-body">Login access for judges, DJs, and event admins. Looking for contestant or spectator access? Head back to <a href="/portal" className="text-gold-light underline">Portal Access</a>.</p>
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
