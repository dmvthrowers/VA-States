import type { Metadata } from 'next';

// Per-page title; noindex because this is a personal or day-of ops page.
export const metadata: Metadata = {
  title: 'Music Upload',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
