import type { Metadata } from 'next';
import { contest } from '@/contest.config';

export const metadata: Metadata = {
  title: 'Prizes',
  description: `What each division awards at ${contest.shortName}, by how many people enter.`,
  alternates: { canonical: '/prizes' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
