'use client';

import { Analytics } from '@vercel/analytics/next';

/**
 * Page-view analytics with query strings removed. Confirmation and upload links carry a
 * registration id or upload token in the URL (/confirm?id=..., /upload?token=...), and those
 * must never reach an analytics log.
 */
export default function AnalyticsScrubbed() {
  return (
    <Analytics
      beforeSend={(event) => {
        try {
          const url = new URL(event.url);
          url.search = '';
          url.hash = '';
          return { ...event, url: url.toString() };
        } catch {
          return null;
        }
      }}
    />
  );
}
