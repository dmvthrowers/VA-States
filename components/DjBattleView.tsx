'use client';

import { useCallback, useEffect, useState } from 'react';

interface Side { id: string; name: string; filename: string | null; is_fallback: boolean }
interface BattleMatch {
  id: string;
  round_label: string;
  position: number;
  is_third_place: boolean;
  status: 'pending' | 'live' | 'done';
  winner: string | null;
  a: Side | null;
  b: Side | null;
}
interface BattleResponse {
  division_name: string;
  slot: string | null;
  slot_label: string | null;
  match_format: string | null;
  rules: string[];
  cue_id: string | null;
  matches: BattleMatch[];
}

const label: React.CSSProperties = { fontSize: '0.6rem', letterSpacing: '0.14em', fontWeight: 800, color: 'var(--text-muted)' };
const goldBtn: React.CSSProperties = { background: 'var(--gold)', color: 'var(--navy-deep)', border: 'none', padding: '0.5rem 1rem', fontWeight: 800, fontSize: '0.8rem', letterSpacing: '0.05em', cursor: 'pointer' };
const ghostBtn: React.CSSProperties = { background: 'transparent', color: 'var(--gold)', border: '1px solid var(--gold)', padding: '0.5rem 1rem', fontWeight: 800, fontSize: '0.8rem', letterSpacing: '0.05em', cursor: 'pointer' };

/**
 * DJ view for a battle (bracket) division: the match to cue, both entrants' battle tracks side by
 * side, and the rest of the bracket in play order. The match is chosen by staff in the admin
 * bracket screen (set live); until one is live, the next undecided match is cued.
 */
export default function DjBattleView({ token, division }: { token: string; division: string }) {
  const [data, setData] = useState<BattleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ id: string; filename: string; url: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/dj/battle?division=${encodeURIComponent(division)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? 'Could not load the bracket.');
        return;
      }
      setData(await res.json());
      setError(null);
    } catch {
      // Keep the last bracket on screen if a refresh fails.
    }
  }, [token, division]);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  async function fetchTrack(side: Side, download: boolean) {
    if (!data?.slot) return;
    setBusy(side.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/dj/music-url?registration_id=${side.id}&division=${encodeURIComponent(division)}&slot=${encodeURIComponent(data.slot)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? 'Could not load the track.');
      if (download) window.open(body.download_url, '_blank');
      else setLoaded({ id: side.id, filename: body.filename, url: body.play_url });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the track.');
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return <div style={{ color: 'var(--text-muted)' }}>{error ?? 'Loading the bracket...'}</div>;
  }

  const current = data.matches.find((m) => m.id === (picked ?? data.cue_id)) ?? null;
  const upcoming = data.matches.filter((m) => m.id !== current?.id && m.a && m.b && !m.winner);

  const sideCard = (side: Side | null, tag: string) => (
    <div style={{ flex: '1 1 280px', background: '#1a1400', border: '2px solid var(--gold)', padding: '1.25rem 1.5rem' }}>
      <div style={label}>{tag}</div>
      {side ? (
        <>
          <div style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.7rem', fontWeight: 700, lineHeight: 1.15, margin: '0.25rem 0 0.6rem' }}>
            {side.name}
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: side.is_fallback ? 'var(--gold)' : side.filename ? '#fff' : '#ff6b6b', marginBottom: '0.75rem' }}>
            {side.is_fallback && <strong>LO-FI (no upload) · </strong>}
            {side.filename ?? `No ${data.slot_label?.toLowerCase() ?? 'battle track'} uploaded`}
          </div>
          {side.filename && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" style={{ ...goldBtn, opacity: busy === side.id ? 0.6 : 1 }} disabled={busy === side.id} onClick={() => fetchTrack(side, false)}>
                {busy === side.id ? 'Loading...' : '▶ Play'}
              </button>
              <button type="button" style={ghostBtn} disabled={busy === side.id} onClick={() => fetchTrack(side, true)}>⬇ Download</button>
            </div>
          )}
          {loaded && loaded.id === side.id && (
            <audio key={loaded.url} controls autoPlay src={loaded.url} style={{ width: '100%', marginTop: '1rem' }} />
          )}
        </>
      ) : (
        <div style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Waiting on the previous match.</div>
      )}
    </div>
  );

  return (
    <div>
      <div style={{ ...label, color: 'var(--gold)', marginBottom: '0.75rem' }}>
        {data.division_name.toUpperCase()} · {current ? current.round_label.toUpperCase() : 'BATTLES'}
        {current?.status === 'live' && ' · LIVE'}
        {data.match_format ? ` · ${data.match_format}` : ''}
      </div>

      {current ? (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {sideCard(current.a, 'ENTRANT A')}
          {sideCard(current.b, 'ENTRANT B')}
        </div>
      ) : (
        <div style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '1.5rem 2rem', color: 'var(--text-muted)' }}>
          {data.matches.length === 0 ? 'The bracket has not been drawn yet.' : 'Every battle is decided.'}
        </div>
      )}

      {data.rules.length > 0 && (
        <ul style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '1rem 0 0', paddingLeft: '1.2rem' }}>
          {data.rules.map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}
      {error && <p style={{ color: '#ff6b6b', fontSize: '0.8rem', marginTop: '0.75rem' }}>{error}</p>}

      {upcoming.length > 0 && (
        <section style={{ marginTop: '2rem' }}>
          <div style={{ ...label, color: 'var(--gold)', marginBottom: '0.5rem' }}>UP NEXT</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, border: '1px solid var(--navy-border)' }}>
            {upcoming.map((m) => (
              <li key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.6rem 1rem', borderBottom: '1px solid var(--navy-border)', background: 'var(--navy)' }}>
                <span style={{ ...label, minWidth: 90 }}>{m.round_label.toUpperCase()}</span>
                <span style={{ flex: 1, color: '#fff' }}>{m.a?.name} <span style={{ color: 'var(--text-muted)' }}>vs</span> {m.b?.name}</span>
                {(!m.a?.filename || !m.b?.filename) && <span style={{ fontSize: '0.7rem', color: '#ff6b6b' }}>missing track</span>}
                <button type="button" style={ghostBtn} onClick={() => { setPicked(m.id); setLoaded(null); }}>Cue</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {picked && (
        <button type="button" style={{ ...ghostBtn, marginTop: '1rem' }} onClick={() => { setPicked(null); setLoaded(null); }}>
          Back to the live match
        </button>
      )}
    </div>
  );
}
