import type { Metadata } from 'next';
import { contest } from '@/contest.config';

export const metadata: Metadata = {
  title: "Judges' Scores",
  description: `Every judge's score for every competitor at ${contest.shortName}, once each round's results are released.`,
  alternates: { canonical: '/results/judges' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
