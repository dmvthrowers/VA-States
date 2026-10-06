import type { Metadata } from 'next';
import AnalyticsScrubbed from '@/components/AnalyticsScrubbed';
import './globals.css';

const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://register.dmvthrowers.club';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Each route sets its own title (see the per-route layout.tsx files); the
  // template keeps the contest name on every tab.
  title: {
    default: 'VSYC-26 · Virginia State Yo-Yo Contest · Brought to You by Goodles',
    template: '%s · VSYC-26',
  },
  description: 'Registration, results and run order for VSYC-26, the Virginia State Yo-Yo Contest — brought to you by Goodles. Held September 19, 2026 · Dulles Town Center · Sterling, VA.',
  openGraph: {
    title: 'VSYC-26 · Virginia State Yo-Yo Contest',
    description: 'Results and run order — held September 19, 2026 · Dulles Town Center · Sterling, VA',
    url: SITE_URL,
    siteName: 'DMV Throwers',
    images: [{ url: 'https://dmvthrowers.club/assets/images/vsyc26-va-logo-512.png', alt: 'VA State Yo-Yo Competition logo' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@dmv_throwers',
    title: 'VSYC-26 · Virginia State Yo-Yo Contest',
    description: 'Results and run order — held September 19, 2026 · Dulles Town Center',
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
  sponsor: {
    '@type': 'Organization',
    name: 'Goodles',
    url: 'https://www.goodles.com/shop/?collection=twirly-mac',
  },
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
        <AnalyticsScrubbed />
      </body>
    </html>
  );
}
