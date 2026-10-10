'use client';

import { useEffect, useState } from 'react';
import BracketStaffGate from '@/components/BracketStaffGate';
import { DIVISION_CODES, divisionByCode } from '@/contest.config';
import { roundsOf } from '@/lib/divisions-core';
import type { McCard } from '@/lib/mc-cards';

/** MC cards (master plan T4): one card per competitor in run order. Prints as a fallback. */
function Cards({ token }: { token: string }) {
  const [division, setDivision] = useState(DIVISION_CODES[0] ?? '');
  const [round, setRound] = useState(1);
  const [loaded, setLoaded] = useState<{ key: string; cards?: McCard[]; error?: true } | null>(null);
  const key = `${division}:${round}`;
  const rounds = roundsOf(divisionByCode(division));

  useEffect(() => {
    if (!division) return;
    let live = true;
    const load = () => {
      fetch(`/api/staff/mc-cards?division=${encodeURIComponent(division)}&round=${round}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error('bad response'))))
        .then((json) => { if (live) setLoaded({ key, cards: json.cards }); })
        .catch(() => { if (live) setLoaded({ key, error: true }); });
    };
    load();
    const id = setInterval(load, 15000);
    return () => { live = false; clearInterval(id); };
  }, [division, round, token, key]);

  const current = loaded && loaded.key === key ? loaded : null;
  const pill = (active: boolean): React.CSSProperties => ({
    padding: '0.4rem 0.8rem', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer',
    border: `1px solid ${active ? 'var(--gold)' : 'var(--navy-border)'}`, background: active ? 'var(--gold)' : 'transparent', color: active ? 'var(--navy-deep)' : 'var(--text-muted)',
  });

  return (
    <div>
      <style>{`@media print { nav, footer, .no-print { display: none !important; } body { background: #fff !important; } .mc-card { color: #000 !important; background: #fff !important; border: 1px solid #000 !important; break-inside: avoid; } .mc-card * { color: #000 !important; } }`}</style>
      <h1 className="no-print" style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.6rem', margin: '0 0 0.75rem' }}>MC Cards</h1>
      <div className="no-print" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        {DIVISION_CODES.map((code) => (
          <button key={code} type="button" aria-pressed={division === code} onClick={() => { setDivision(code); setRound(1); }} style={pill(division === code)}>{divisionByCode(code)?.name ?? code}</button>
        ))}
      </div>
      {rounds.length > 1 && (
        <div className="no-print" role="group" aria-label="Round" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          {rounds.map((r, i) => <button key={r.name} type="button" aria-pressed={round === i + 1} onClick={() => setRound(i + 1)} style={pill(round === i + 1)}>{r.name}</button>)}
        </div>
      )}
      <p className="no-print" style={{ margin: '0 0 1rem' }}>
        <button type="button" onClick={() => window.print()} style={pill(false)}>Print</button>
      </p>
      {!current && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
      {current?.error && <p role="alert" style={{ color: '#ff6b6b' }}>The cards didn&rsquo;t load. Refresh to try again.</p>}
      {current?.cards && current.cards.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No run order set for this round yet.</p>}
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {current?.cards?.map((c) => (
          <article key={c.position} className="mc-card" style={{ border: '1px solid var(--navy-border)', background: c.status === 'performing' ? '#1a1400' : 'var(--navy)', padding: '0.9rem 1rem', opacity: c.status === 'done' ? 0.6 : 1 }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--gold)', fontWeight: 800 }}>#{c.position}</span>
              <h2 style={{ color: '#fff', fontSize: '1.3rem', margin: 0, fontFamily: "'Playfair Display', serif" }}>{c.name}</h2>
              {c.from && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{c.from}</span>}
            </div>
            {c.say_as && <p style={{ margin: '0.4rem 0 0', color: 'var(--gold-light)' }}>Say: <strong>{c.say_as}</strong></p>}
            {c.intro && <p style={{ margin: '0.4rem 0 0', color: 'var(--text-body)' }}>{c.intro}</p>}
            {(c.sponsor || c.club) && (
              <p style={{ margin: '0.4rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {c.sponsor && <>Sponsor: {c.sponsor}</>}{c.sponsor && c.club && ' · '}{c.club && <>Club: {c.club}</>}
              </p>
            )}
            {c.restricted && <p style={{ margin: '0.4rem 0 0', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Junior: use this name only.</p>}
          </article>
        ))}
      </div>
    </div>
  );
}

export default function McCardsPage() {
  return (
    <BracketStaffGate title="MC Cards" roles={['admin']}>
      {({ token }) => <Cards token={token} />}
    </BracketStaffGate>
  );
}
