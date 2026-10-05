'use client';

import { useEffect, useState } from 'react';
import type { SideEventView } from '@/app/api/side-events/route';

/** Poll GET /api/side-events (optionally one ?code=) every `ms`. Keeps the last good data. */
export function useSideEvents(code: string | null, ms = 10000) {
  const [events, setEvents] = useState<SideEventView[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const url = code ? `/api/side-events?code=${encodeURIComponent(code)}` : '/api/side-events';
    const tick = async () => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok && !stopped) { setEvents((await res.json()).events); setError(false); }
        else if (!stopped) setError(true);
      } catch { if (!stopped) setError(true); }
      if (!stopped) timer = setTimeout(tick, ms);
    };
    tick();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [code, ms]);
  return { events, error };
}

/** One event's leaderboard: place, name, best value. */
export function SideLeaderboard({ ev, limit }: { ev: SideEventView; limit?: number }) {
  const rows = limit ? ev.leaderboard.slice(0, limit) : ev.leaderboard;
  if (rows.length === 0) return <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>No tries yet. Be the first.</p>;
  return (
    <ol aria-label={`${ev.name} leaderboard`} style={{ listStyle: 'none', margin: 0, padding: 0, border: '1px solid var(--navy-border)' }}>
      {rows.map((r, i) => (
        <li key={`${r.name}-${i}`} style={{
          display: 'flex', justifyContent: 'space-between', gap: '0.75rem', padding: '0.7rem 1rem',
          borderBottom: i < rows.length - 1 ? '1px solid var(--navy-border)' : 'none',
          background: r.place === 1 ? '#1a1400' : i % 2 === 0 ? 'var(--navy)' : 'transparent',
        }}>
          <span style={{ display: 'flex', gap: '0.85rem', minWidth: 0 }}>
            <span style={{ width: '1.5rem', textAlign: 'center', fontWeight: 800, color: r.place === 1 ? 'var(--gold)' : 'var(--text-muted)' }}>{r.place}</span>
            <span style={{ fontWeight: 700, color: r.place === 1 ? 'var(--gold)' : '#fff', overflowWrap: 'anywhere' }}>{r.name}</span>
          </span>
          <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#fff', whiteSpace: 'nowrap' }}>{r.value_label}</span>
        </li>
      ))}
    </ol>
  );
}
