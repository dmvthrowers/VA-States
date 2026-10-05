import type { Metadata } from 'next';
import { contest } from '@/contest.config';

export const metadata: Metadata = {
  title: 'Side Events',
  description: `Live leaderboards for the ${contest.shortName} side events. Anyone can try.`,
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
