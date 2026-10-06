import type { Metadata } from 'next';

// Personal confirmation page: keep it out of search results.
export const metadata: Metadata = {
  title: 'Spectator Confirmation',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
