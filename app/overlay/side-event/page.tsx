'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSideEvents } from '@/components/SideEventBoard';

/**
 * Stream overlay for an OBS browser source: one side event's top 5 and the newest try.
 * ?code=SLEEPER picks the event. Polls every 3s. Transparent background (?bg=1 for solid navy).
 */
function Overlay() {
  const params = useSearchParams();
  const code = params.get('code') ?? '';
  const solid = params.get('bg') === '1';
  const { events } = useSideEvents(code || null, 3000);

  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = solid ? 'var(--navy-deep)' : 'transparent';
    return () => { document.body.style.background = prev; };
  }, [solid]);

  if (!code) return <p style={{ color: '#fff', padding: '1rem' }}>Add ?code=EVENT to the URL.</p>;
  const ev = events?.[0];
  if (!ev) return null;
  const label = { fontFamily: 'var(--font-condensed)', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' as const };

  return (
    <main style={{ position: 'fixed', right: 0, bottom: 0, padding: '1.5rem 2rem', width: 'min(100%, 28rem)', boxSizing: 'border-box' }}>
      <div style={{ background: 'rgba(8, 18, 42, 0.85)', borderTop: '4px solid var(--gold)', padding: '1rem 1.25rem' }}>
        <div style={{ ...label, color: 'var(--gold)', fontSize: '1.1rem', marginBottom: '0.5rem' }}>{ev.name}</div>
        {ev.leaderboard.length === 0 ? (
          <div style={{ color: '#fff', fontSize: '1.1rem' }}>No tries yet. Step up.</div>
        ) : (
          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {ev.leaderboard.slice(0, 5).map((r, i) => (
              <li key={`${r.name}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.2rem 0', fontSize: '1.25rem', fontWeight: 800 }}>
                <span style={{ color: r.place === 1 ? 'var(--gold-light)' : '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.place}. {r.name}</span>
                <span style={{ fontFamily: 'monospace', color: '#fff', whiteSpace: 'nowrap' }}>{r.value_label}</span>
              </li>
            ))}
          </ol>
        )}
        {ev.latest && (
          <div style={{ ...label, color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.6rem' }}>
            Just in: {ev.latest.name} · {ev.latest.value_label}
          </div>
        )}
      </div>
    </main>
  );
}

export default function SideEventOverlayPage() {
  return <Suspense fallback={null}><Overlay /></Suspense>;
}
