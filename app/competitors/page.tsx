import { redirect } from 'next/navigation';

// Superseded by /directory, which also correctly filters to is_public = true
// (this page previously listed ALL paid competitors regardless of their
// public-listing choice — a privacy bug now fixed by retiring it).
export default function CompetitorsRedirect() {
  redirect('/directory');
}
