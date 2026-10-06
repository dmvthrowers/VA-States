import type { Metadata } from 'next';

// Per-page title (the bracket itself is a client component).
export const metadata: Metadata = {
  title: 'Battle Bracket',
  description: "The Stella Duellum battle bracket from VSYC-26, round by round.",
  alternates: { canonical: '/results/bracket' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
