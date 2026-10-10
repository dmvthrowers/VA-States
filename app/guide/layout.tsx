import type { Metadata } from 'next';
import { contest } from '@/contest.config';

export const metadata: Metadata = {
  title: 'Contest Guide',
  description: `Divisions, fees, music deadline and what to expect at ${contest.shortName}, in one place.`,
  alternates: { canonical: '/guide' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
