import type { Metadata } from 'next';

// Per-page title (the page is a client component, so metadata lives here).
export const metadata: Metadata = {
  title: 'Player Directory',
  description: "Browse the players who competed at VSYC-26 and chose to be listed, with their divisions and home states.",
  alternates: { canonical: '/directory' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
