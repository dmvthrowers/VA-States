import type { Metadata } from 'next';
import { contest } from '@/contest.config';

export const metadata: Metadata = {
  title: 'Trick Lists',
  description: `The trick list for each ladder division at ${contest.shortName}, in order.`,
  alternates: { canonical: '/tricks' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
