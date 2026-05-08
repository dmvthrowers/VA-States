/** VSYC-26 Footer — matches ui_kits/vsyc26/index.html footer pattern */

import Image from 'next/image';

const SITE_HOME = 'https://dmvthrowers.club/vsyc26-register.html';

const FOOTER_LINKS = [
  { label: 'Event Info',  href: SITE_HOME },
  { label: 'About',       href: 'https://dmvthrowers.club/vsyc26.html' },
  { label: 'Schedule',    href: 'https://dmvthrowers.club/vsyc26-schedule.html' },
  { label: 'Sponsors',    href: 'https://dmvthrowers.club/vsyc26-sponsors.html' },
  { label: 'Venue',       href: 'https://dmvthrowers.club/vsyc26-venue.html' },
];

export default function Footer() {
  return (
    <footer style={{
      background: '#080d1a',
      padding: '40px 24px 24px',
      borderTop: '1px solid var(--navy-border)',
      marginTop: '4rem',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Top row */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap' as const,
          gap: 20,
          marginBottom: 24,
        }}>
          {/* Brand */}
          <a href={SITE_HOME} style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
            <Image
              src="https://dmvthrowers.club/assets/images/vsyc26-va-logo-32.png"
              alt="VSYC-26"
              width={34}
              height={34}
              style={{ objectFit: 'contain' }}
            />
            <div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 900,
                fontSize: '0.95rem',
                color: '#fff',
              }}>
                Virginia State Yo-Yo Contest 2026
              </div>
              <div style={{
                fontFamily: 'var(--font-condensed)',
                fontSize: '0.58rem',
                letterSpacing: '0.18em',
                color: 'var(--gold)',
                fontWeight: 700,
                textTransform: 'uppercase' as const,
              }}>
                Organized by DMV Throwers · VSYC-26
              </div>
            </div>
          </a>

          {/* Links */}
          <nav aria-label="Footer navigation">
            {FOOTER_LINKS.map(link => (
              <a
                key={link.label}
                href={link.href}
                style={{
                  color: '#fff',
                  fontSize: '0.75rem',
                  textDecoration: 'none',
                  margin: '0 10px',
                  fontFamily: 'var(--font-body)',
                  transition: 'color 0.2s',
                }}
                onMouseOver={e => (e.currentTarget.style.color = 'var(--gold)')}
                onMouseOut={e => (e.currentTarget.style.color = '#fff')}
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>

        {/* Bottom row */}
        <div style={{
          borderTop: '1px solid var(--navy-border)',
          paddingTop: 20,
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap' as const,
          gap: 6,
        }}>
          <span style={{ fontSize: '0.68rem', color: '#3a4a6a', fontFamily: 'var(--font-body)' }}>
            © 2026 Virginia State Yo-Yo Contest · Organized by{' '}
            <a href="https://dmvthrowers.club" style={{ color: '#3a4a6a', textDecoration: 'none' }}>
              DMV Throwers
            </a>{' '}
            · <a href="mailto:dmvthrowers@gmail.com" style={{ color: '#3a4a6a', textDecoration: 'none' }}>
              dmvthrowers@gmail.com
            </a>
          </span>
          <span style={{ fontSize: '0.68rem', color: '#3a4a6a', fontFamily: 'var(--font-body)' }}>
            September 19, 2026 · Dulles Town Center · Sterling, VA
          </span>
        </div>
      </div>
    </footer>
  );
}
