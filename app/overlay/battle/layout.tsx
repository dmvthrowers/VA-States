import type { Metadata } from 'next';

// Stream overlay (OBS browser source); not a page for search engines.
export const metadata: Metadata = {
  title: 'Battle Overlay',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
