/** VSYC-26 NavBar — matches ui_kits/vsyc26/index.html nav pattern */

const SITE_HOME = 'https://dmvthrowers.club/vsyc26-register.html';

interface NavBarProps {
  activePage?: 'register' | 'upload' | 'confirm';
}

const NAV_LINKS = [
  { label: 'About',    href: 'https://dmvthrowers.club/vsyc26.html' },
  { label: 'Schedule', href: 'https://dmvthrowers.club/vsyc26-schedule.html' },
  { label: 'Register', href: SITE_HOME },
  { label: 'Sponsors', href: 'https://dmvthrowers.club/vsyc26-sponsors.html' },
  { label: 'Venue',    href: 'https://dmvthrowers.club/vsyc26-venue.html' },
];

export default function NavBar({ activePage }: NavBarProps) {
  return (
    <>
      {/* Top bar — gold strip matching UI kit #top-bar */}
      <div style={{
        background: 'var(--gold)',
        padding: '7px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap' as const,
      }}>
        <span style={{
          fontFamily: 'var(--font-condensed)',
          fontSize: '0.72rem',
          color: 'var(--navy-deep)',
          letterSpacing: '0.14em',
          fontWeight: 800,
          textTransform: 'uppercase' as const,
        }}>
          VSYC-26 · SEPTEMBER 19, 2026 · DULLES TOWN CENTER · STERLING VA
        </span>
        <a
          href="https://dmvthrowers.club/vsyc26-sponsors.html"
          style={{
            fontFamily: 'var(--font-condensed)',
            fontSize: '0.72rem',
            color: 'var(--navy-deep)',
            fontWeight: 800,
            letterSpacing: '0.12em',
            textTransform: 'uppercase' as const,
            textDecoration: 'underline',
            whiteSpace: 'nowrap' as const,
          }}
        >
          SPONSOR VSYC-26 →
        </a>
      </div>

      {/* Main nav */}
      <nav
        aria-label="Site navigation"
        style={{
          background: 'var(--navy-deep)',
          borderBottom: '1px solid var(--navy-border)',
          padding: '0 24px',
          position: 'sticky' as const,
          top: 0,
          zIndex: 200,
        }}
      >
        <div style={{
          maxWidth: 1100,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 64,
        }}>
          {/* Brand */}
          <a
            href={SITE_HOME}
            aria-label="VSYC-26 home"
            style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}
          >
            <img
              src="https://dmvthrowers.club/assets/images/vsyc26-va-logo-32.png"
              alt=""
              aria-hidden="true"
              width={34}
              height={34}
              style={{ objectFit: 'contain' }}
            />
            <div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 900,
                fontSize: '1rem',
                color: '#fff',
                lineHeight: 1,
              }}>
                VSYC-26
              </div>
              <div style={{
                fontFamily: 'var(--font-condensed)',
                fontSize: '0.55rem',
                letterSpacing: '0.2em',
                color: 'var(--gold)',
                fontWeight: 700,
                marginTop: 2,
                textTransform: 'uppercase' as const,
              }}>
                Virginia State Yo-Yo Contest
              </div>
            </div>
          </a>

          {/* Nav links */}
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            {/* Back to main site */}
            <a
              href={SITE_HOME}
              style={{
                background: 'var(--gold)',
                color: 'var(--navy-deep)',
                fontFamily: 'var(--font-condensed)',
                fontSize: '0.72rem',
                fontWeight: 800,
                letterSpacing: '0.12em',
                textTransform: 'uppercase' as const,
                textDecoration: 'none',
                padding: '6px 14px',
              }}
            >
              ← EVENT INFO
            </a>

            {NAV_LINKS.filter(l => l.label !== 'Register').map(link => (
              <a
                key={link.label}
                href={link.href}
                style={{
                  fontFamily: 'var(--font-condensed)',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  color: 'var(--text-muted)',
                  textDecoration: 'none',
                  padding: '6px 0',
                  borderBottom: '2px solid transparent',
                  textTransform: 'uppercase' as const,
                  display: 'none', // hidden on mobile; shown at ≥900px via media query can't be inline
                }}
                className="nav-link-item"
              >
                {link.label}
              </a>
            ))}

            {activePage === 'register' && (
              <span
                style={{
                  fontFamily: 'var(--font-condensed)',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  color: 'var(--gold)',
                  padding: '6px 0',
                  borderBottom: '2px solid var(--gold)',
                  textTransform: 'uppercase' as const,
                }}
              >
                REGISTER
              </span>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
