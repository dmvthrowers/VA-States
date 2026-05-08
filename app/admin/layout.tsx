export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--navy-deep)' }}>
      <header style={{ background: 'var(--navy)', borderBottom: '2px solid var(--red)', padding: '0 1.5rem' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <span style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontWeight: 700, fontSize: '1rem', letterSpacing: '0.05em' }}>
              VSYC-26 Admin
            </span>
            <nav aria-label="Admin navigation" style={{ display: 'flex', gap: '1rem' }}>
              <a href="/admin" style={{ color: 'var(--text-body)', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Registrations
              </a>
              <a href="/admin/codes" style={{ color: 'var(--text-body)', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Comp Codes
              </a>
              <a href="/api/admin/export-csv" style={{ color: 'var(--text-body)', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Export CSV ↓
              </a>
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
