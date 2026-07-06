import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Register · VSYC-26 · Virginia State Yo-Yo Contest 2026',
  description: 'Competitor registration for VSYC-26 — September 19, 2026 · Dulles Town Center · Sterling, VA. 1A: $25, X Division: $20, Sport/Beginner/Junior: $15.',
  openGraph: {
    title: 'Register · VSYC-26',
    description: 'Competitor registration — September 19, 2026 · Dulles Town Center · Sterling, VA',
    url: 'https://register.dmvthrowers.club',
    siteName: 'DMV Throwers',
    images: [{ url: 'https://dmvthrowers.club/assets/images/vsyc26-va-logo-512.png', alt: 'VA State Yo-Yo Competition logo' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@dmv_throwers',
    title: 'Register · VSYC-26',
    description: 'Competitor registration — September 19, 2026 · Dulles Town Center',
    images: ['https://dmvthrowers.club/assets/images/vsyc26-va-logo-512.png'],
  },
  robots: { index: true, follow: true },
};

const eventJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SportsEvent',
  name: 'VSYC-26 — Virginia State Yo-Yo Contest',
  startDate: '2026-09-19T09:00:00-04:00',
  eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
  eventStatus: 'https://schema.org/EventScheduled',
  location: {
    '@type': 'Place',
    name: 'Dulles Town Center',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Sterling',
      addressRegion: 'VA',
      addressCountry: 'US',
    },
  },
  organizer: {
    '@type': 'Organization',
    name: 'DMV Throwers',
    url: 'https://dmvthrowers.club',
  },
  offers: [
    { '@type': 'Offer', name: '1A — Single String', price: '25', priceCurrency: 'USD', url: 'https://register.dmvthrowers.club', availability: 'https://schema.org/InStock' },
    { '@type': 'Offer', name: 'X Division', price: '20', priceCurrency: 'USD', url: 'https://register.dmvthrowers.club', availability: 'https://schema.org/InStock' },
    { '@type': 'Offer', name: 'Sport / Beginner / Junior', price: '15', priceCurrency: 'USD', url: 'https://register.dmvthrowers.club', availability: 'https://schema.org/InStock' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="icon" type="image/png" sizes="32x32" href="https://dmvthrowers.club/assets/images/vsyc26-va-logo-32.png" />
        <link rel="apple-touch-icon" href="https://dmvthrowers.club/assets/images/vsyc26-va-logo-180.png" />
        <meta name="theme-color" content="#0d1428" />
        <script type="application/ld+json">{JSON.stringify(eventJsonLd)}</script>
      </head>
      <body>
        <a href="#main-content" className="skip-link">Skip to main content</a>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
