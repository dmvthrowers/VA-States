import type { Metadata } from 'next';

// Per-page title (the page is a client component, so metadata lives here).
export const metadata: Metadata = {
  title: 'Want to Sponsor?',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
