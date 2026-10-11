import type { Metadata } from 'next';

// Per-page title; noindex because this is a private admin page.
export const metadata: Metadata = {
  title: 'Event Setup',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
