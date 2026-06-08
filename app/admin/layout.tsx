export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const navLinks = [
    { href: '/admin', label: 'Registrations' },
    { href: '/admin/codes', label: 'Comp Codes' },
    { href: '/admin/run-order', label: 'Run Order' },
    { href: '/admin/walk-up', label: 'Walk-Up' },
    { href: '/admin/results', label: 'Results' },
    { href: '/api/admin/export-csv', label: 'Export CSV ↓' },
  ];

  const portalLinks = [
    { href: '/dj', label: 'DJ Portal' },
    { href: '/judge', label: 'Judge Portal' },
  ];

  const linkStyle: React.CSSProperties = {
    color: 'var(--text-body)',
    textDecoration: 'none',
    fontSize: '0.8rem',
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  };

  const portalLinkStyle: React.CSSProperties = {
    color: 'var(--gold)',
    textDecoration: 'none',
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--navy-deep)' }}>
      <header style={{ background: 'var(--navy)', borderBottom: '2px solid var(--red)', padding: '0 1.5rem' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <span style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontWeight: 700, fontSize: '1rem', letterSpacing: '0.05em' }}>
              VSYC-26 Admin
            </span>
            <nav aria-label="Admin navigation" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {navLinks.map(({ href, label }) => (
                <a key={href} href={href} style={linkStyle}>{label}</a>
              ))}
              <span style={{ color: 'var(--navy-border)', fontSize: '0.9rem', userSelect: 'none' }}>|</span>
              {portalLinks.map(({ href, label }) => (
                <a key={href} href={href} style={portalLinkStyle} target="_blank" rel="noopener noreferrer">{label} ↗</a>
              ))}
            </nav>
          </div>
          <span style={{ color: 'var(--red)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Admin Access
          </span>
        </div>
      </header>
      <main id="main-content" style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem' }}>
        {children}
      </main>
    </div>
  );
}
