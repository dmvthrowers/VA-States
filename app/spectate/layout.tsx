import type { Metadata } from 'next';

// Per-page title (the page is a client component, so metadata lives here).
export const metadata: Metadata = {
  title: 'RSVP to Spectate',
  description: "Free to watch. RSVP to spectate VSYC-26 at Dulles Town Center in Sterling, Virginia.",
  alternates: { canonical: '/spectate' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
