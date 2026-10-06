import type { Metadata } from 'next';

// Per-page title (the page is a client component, so metadata lives here).
export const metadata: Metadata = {
  title: 'Results',
  description: "Results, podiums and Virginia State Champions from VSYC-26, the Virginia State Yo-Yo Contest.",
  alternates: { canonical: '/results' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
