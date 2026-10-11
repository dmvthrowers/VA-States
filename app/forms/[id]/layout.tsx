import type { Metadata } from 'next';

// Forms are reached by a link we share, not found through search: some collect private details.
export const metadata: Metadata = {
  title: 'Form',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
