import type { Metadata } from 'next';
import { contest } from '@/contest.config';

export const metadata: Metadata = {
  title: 'Live Schedule',
  alternates: { canonical: '/schedule' },
  description: `The ${contest.shortName} schedule, updated live as each division runs.`,
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
