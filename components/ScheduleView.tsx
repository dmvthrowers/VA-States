'use client';

import { useEffect, useState } from 'react';
import type { FeedItem, FeedNowItem, RunOrderSnapshot, ScheduleFeed } from '@/lib/schedule-feed-core';

/**
 * Shared pieces for the live schedule pages (/schedule, /admin/schedule, /overlay/schedule).
 * The feed comes from GET /api/schedule (public) or /api/admin/schedule (staff, never cached).
 */

/** Poll a schedule feed every `ms`. Keeps the last good feed through a failed request. */
export function useScheduleFeed(url: string, ms = 15000, token?: string, refreshKey = 0) {
  const [feed, setFeed] = useState<ScheduleFeed | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const res = await fetch(url, { cache: 'no-store', headers: token ? { Authorization: `Bearer ${token}` } : undefined });
        if (res.ok && !stopped) { setFeed(await res.json()); setError(false); }
        else if (!stopped) setError(true);
      } catch { if (!stopped) setError(true); }
      if (!stopped) timer = setTimeout(tick, ms);
    };
    tick();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [url, ms, token, refreshKey]);
  return { feed, setFeed, error };
}

/** "1:05 PM" in the contest's time zone. */
export function clock(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone });
}

export const STATUS_LABEL: Record<FeedItem['status'], string> = {
  upcoming: 'Up next',
  live: 'Live now',
  judging: 'Judging',
  done: 'Done',
};

export function delayText(i: FeedItem): string | null {
  if (i.status === 'done' || i.fixed) return null;
  if (i.delay_minutes >= 5) return `Running ${i.delay_minutes} min behind`;
  if (i.delay_minutes <= -5) return `About ${-i.delay_minutes} min early`;
  return null;
}

/** "On stage / On deck" for a judged block that's live. */
export function StageCard({ ro, big = false }: { ro: RunOrderSnapshot; big?: boolean }) {
  const name = { fontWeight: 800, color: '#fff', overflowWrap: 'anywhere' as const };
  return (
    <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.75rem' }}>
      <div>
        <div style={{ fontSize: '0.6rem', letterSpacing: '0.16em', fontWeight: 800, color: 'var(--gold)' }}>ON STAGE</div>
        <div style={{ ...name, fontSize: big ? '2.2rem' : '1.2rem' }}>{ro.performing?.display_name ?? 'Between competitors'}</div>
        {ro.performing?.style && <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{ro.performing.style}</div>}
      </div>
      {ro.on_deck.length > 0 && (
        <div>
          <div style={{ fontSize: '0.6rem', letterSpacing: '0.16em', fontWeight: 800, color: 'var(--text-muted)' }}>ON DECK</div>
          <div style={{ color: 'var(--text-body)', fontSize: big ? '1.3rem' : '0.95rem' }}>
            {ro.on_deck.map((p) => p.display_name).join(' · ')}
          </div>
        </div>
      )}
      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{ro.done} of {ro.total} done</div>
    </div>
  );
}

/** The whole day as a list. `actions` renders staff controls per row. */
export function ScheduleList({ feed, actions }: { feed: ScheduleFeed; actions?: (i: FeedItem) => React.ReactNode }) {
  const nowIds = new Set(feed.now_items.map((n) => n.id));
  const nowById = new Map<string, FeedNowItem>(feed.now_items.map((n) => [n.id, n]));
  return (
    <ol aria-label="Schedule" style={{ listStyle: 'none', margin: 0, padding: 0, border: '1px solid var(--navy-border)' }}>
      {feed.items.map((i, idx) => {
        const isNow = nowIds.has(i.id);
        const done = i.status === 'done';
        const delay = delayText(i);
        const ro = nowById.get(i.id)?.run_order;
        return (
          <li
            key={i.id}
            aria-current={isNow ? 'step' : undefined}
            style={{
              display: 'flex', gap: '1rem', padding: '0.9rem 1rem',
              borderBottom: idx < feed.items.length - 1 ? '1px solid var(--navy-border)' : 'none',
              borderLeft: `4px solid ${isNow ? 'var(--red)' : 'transparent'}`,
              background: isNow ? '#1a1400' : 'var(--navy)',
              opacity: done ? 0.6 : 1,
            }}
          >
            <div style={{ width: '4.5rem', flexShrink: 0 }}>
              <div style={{ fontFamily: 'monospace', fontWeight: 800, color: isNow ? 'var(--gold)' : '#fff' }}>{clock(i.est_start, feed.timeZone)}</div>
              {i.est_start !== i.planned_start && !done && (
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textDecoration: 'line-through' }}>{clock(i.planned_start, feed.timeZone)}</div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0.25rem 0.6rem' }}>
                <span style={{ fontWeight: 700, color: '#fff' }}>{i.title}</span>
                {i.status !== 'upcoming' && (
                  <span style={{
                    fontSize: '0.6rem', letterSpacing: '0.12em', fontWeight: 800, textTransform: 'uppercase', padding: '0.1rem 0.4rem',
                    background: i.status === 'live' ? 'var(--red)' : 'transparent', color: i.status === 'live' ? '#fff' : 'var(--gold)',
                    border: i.status === 'live' ? 'none' : '1px solid var(--navy-border)',
                  }}>{STATUS_LABEL[i.status]}</span>
                )}
                {i.fixed && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Fixed time</span>}
              </div>
              {i.note && <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 2 }}>{i.note}</div>}
              {delay && <div style={{ color: 'var(--gold-light)', fontSize: '0.75rem', marginTop: 2 }}>{delay}</div>}
              {i.results_url && (
                <a href={i.results_url} style={{ display: 'inline-block', marginTop: 4, fontSize: '0.8rem', fontWeight: 700, color: 'var(--gold-light)' }}>Results are up →</a>
              )}
              {ro && isNow && <StageCard ro={ro} />}
              {actions && <div style={{ marginTop: '0.6rem' }}>{actions(i)}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
