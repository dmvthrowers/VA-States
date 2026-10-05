'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { BracketData, BracketMatchView } from '@/components/BracketView';
import { roundLabel } from '@/components/BracketView';

/**
 * Stream overlay for an OBS / streaming-software browser source: the LIVE battle in
 * ?division=, both names large, and the audience poll counts once entered. Polls every 3s.
 * The page background is transparent (add ?bg=1 for a solid navy background when previewing).
 * Public data only: names come masked from /api/bracket.
 */
function Overlay() {
  const params = useSearchParams();
  const division = params.get('division') ?? '';
  const solid = params.get('bg') === '1';
  const [data, setData] = useState<BracketData | null>(null);

  useEffect(() => {
    if (!division) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const res = await fetch(`/api/bracket?division=${encodeURIComponent(division)}`, { cache: 'no-store' });
        if (res.ok && !stopped) setData(await res.json());
      } catch { /* keep the last frame */ }
      if (!stopped) timer = setTimeout(tick, 3000);
    };
    tick();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [division]);

  // Transparent page for compositing over video.
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = solid ? 'var(--navy-deep)' : 'transparent';
    return () => { document.body.style.background = prev; };
  }, [solid]);

  const live: BracketMatchView | undefined = data?.matches.find((m) => m.status === 'live');
  if (!division) return <p style={{ color: '#fff', padding: '1rem' }}>Add ?division=CODE to the URL.</p>;
  if (!live || !data) return null;

  const showCounts = live.votes_a != null || live.votes_b != null;
  const side = (name: string | null, votes: number | null | undefined, align: 'left' | 'right') => (
    <div style={{ flex: 1, minWidth: 0, textAlign: align }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'clamp(1.8rem, 6vw, 4.5rem)', lineHeight: 1.05, color: '#fff', textShadow: '0 2px 6px rgba(0,0,0,0.6)', overflowWrap: 'anywhere' }}>
        {name ?? 'TBD'}
      </div>
      {showCounts && (
        <div style={{ fontFamily: 'var(--font-condensed)', fontWeight: 800, fontSize: 'clamp(1.4rem, 4vw, 3rem)', color: 'var(--gold-light)' }}>
          {votes ?? 0} <span style={{ fontSize: '0.5em', letterSpacing: '0.12em' }}>VOTES</span>
        </div>
      )}
    </div>
  );

  return (
    <main style={{ position: 'fixed', left: 0, right: 0, bottom: 0, padding: '1.5rem 2rem' }}>
      <div style={{ background: 'rgba(8, 18, 42, 0.85)', borderTop: '4px solid var(--gold)', padding: '1rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', fontFamily: 'var(--font-condensed)', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', fontSize: '1rem' }}>
          <span style={{ background: 'var(--red)', color: '#fff', padding: '0.1rem 0.5rem' }}>LIVE</span>
          <span style={{ color: 'var(--gold)' }}>
            {data.division_name ?? data.division} · {live.is_third_place ? 'Third-place match' : roundLabel(live.round, data.rounds)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          {side(live.a_name, live.votes_a, 'left')}
          <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 900, color: 'var(--gold)', fontSize: 'clamp(1.2rem, 3vw, 2.5rem)' }}>vs</div>
          {side(live.b_name, live.votes_b, 'right')}
        </div>
      </div>
    </main>
  );
}

export default function BattleOverlayPage() {
  return <Suspense fallback={null}><Overlay /></Suspense>;
}
