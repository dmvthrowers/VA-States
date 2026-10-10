import type { MetadataRoute } from 'next';
import { competition, contest } from '@/contest.config';

const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://register.dmvthrowers.club';

export default function sitemap(): MetadataRoute.Sitemap {
  // Fixed date: a build-time `new Date()` made every page look changed on every deploy.
  // Update when public content changes.
  const lastModified = new Date('2026-10-10');

  const routes = [
    '/',
    '/spectate',
    '/policies',
    '/fee-calculator',
    '/directory',
    '/results',
    '/prizes',
    '/schedule',
    '/side-events',
    '/results/bracket',
    '/sponsor',
    ...(contest.rulesPage.enabled ? ['/rules'] : []),
    ...(contest.guide.enabled ? ['/guide'] : []),
    ...(competition.divisions.some((d) => d.scoring.format === 'ladder') ? ['/tricks'] : []),
  ];

  return routes.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified,
    changeFrequency: route === '/' ? 'daily' : 'weekly',
    priority: route === '/' ? 1 : 0.7,
  }));
}
