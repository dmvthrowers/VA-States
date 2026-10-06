'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { clock, useScheduleFeed } from '@/components/ScheduleView';

/**
 * Stream overlay for an OBS browser source: what's on now, who's on stage and on deck, and
 * what's next. Polls /api/schedule every 5s. Transparent background (?bg=1 for solid navy).
 * Public data only: names are the privacy-safe public ones.
 */
function Overlay() {
  const solid = useSearchParams().get('bg') === '1';
  const { feed } = useScheduleFeed('/api/schedule', 5000);

  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = solid ? 'var(--navy-deep)' : 'transparent';
    return () => { document.body.style.background = prev; };
  }, [solid]);

  if (!feed) return null;
  const now = feed.now_items[0];
  const ro = now?.run_order;
  const label = { fontFamily: 'var(--font-condensed)', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' as const, fontSize: '1rem' };
  const big = { fontFamily: 'var(--font-display)', fontWeight: 900, color: '#fff', textShadow: '0 2px 6px rgba(0,0,0,0.6)', overflowWrap: 'anywhere' as const, lineHeight: 1.05 };

  return (
    <main style={{ position: 'fixed', left: 0, right: 0, bottom: 0, padding: '1.5rem 2rem' }}>
      <div style={{ background: 'rgba(8, 18, 42, 0.85)', borderTop: '4px solid var(--gold)', padding: '1rem 1.5rem', display: 'flex', gap: '2rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 0 }}>
          {now ? (
            <>
              <div style={{ ...label, display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <span style={{ background: 'var(--red)', color: '#fff', padding: '0.1rem 0.5rem' }}>{now.status === 'judging' ? 'JUDGING' : 'LIVE'}</span>
                <span style={{ color: 'var(--gold)' }}>{now.title}</span>
              </div>
              {ro?.performing && now.status === 'live' && (
                <div style={{ ...big, fontSize: 'clamp(1.8rem, 5vw, 4rem)', marginTop: '0.35rem' }}>{ro.performing.display_name}</div>
              )}
              {ro && ro.on_deck.length > 0 && now.status === 'live' && (
                <div style={{ ...label, color: 'var(--gold-light)', marginTop: '0.35rem' }}>On deck: {ro.on_deck.map((p) => p.display_name).join(' · ')}</div>
              )}
            </>
          ) : feed.next ? (
            <>
              <div style={{ ...label, color: 'var(--gold)' }}>Up next · {clock(feed.next.est_start, feed.timeZone)}</div>
              <div style={{ ...big, fontSize: 'clamp(1.6rem, 4vw, 3.2rem)' }}>{feed.next.title}</div>
            </>
          ) : null}
        </div>
        {now && feed.next && (
          <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
            <div style={{ ...label, color: 'var(--text-muted)' }}>Next · {clock(feed.next.est_start, feed.timeZone)}</div>
            <div style={{ ...label, color: '#fff', fontSize: '1.3rem' }}>{feed.next.title}</div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function ScheduleOverlayPage() {
  return <Suspense fallback={null}><Overlay /></Suspense>;
}
