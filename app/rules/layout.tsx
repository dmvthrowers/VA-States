import type { Metadata } from 'next';
import { contest } from '@/contest.config';

export const metadata: Metadata = {
  title: 'Rules & Changes',
  description: `The rules and scoring for ${contest.shortName}, with a dated list of every change.`,
  alternates: { canonical: '/rules' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
