import type { Metadata } from 'next';

// Per-page title (the bracket itself is a client component).
export const metadata: Metadata = {
  title: 'Battle Bracket',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
