'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { majorityPick, pollWinner } from '@/lib/divisions-core';

/**
 * A single-elimination battle bracket (GET /api/bracket).
 *
 *  - public: read-only, privacy-safe names.
 *  - judge:  big A / B vote buttons for the live (or tapped) match. Audience-decided divisions
 *            say so instead.
 *  - admin:  vote tally or poll-count inputs, Confirm A / B (with a suggestion), clear the
 *            winner, set the match live.
 *
 * Rounds are columns that scroll sideways inside the component; on narrow screens they stack.
 */

export type MatchStatus = 'pending' | 'live' | 'done';

export interface BracketMatchView {
  id: string;
  round: number;
  position: number;
  is_third_place: boolean;
  entry_a: string | null;
  entry_b: string | null;
  winner: string | null;
  status: MatchStatus;
  updated_at?: string;
  votes_a?: number | null;
  votes_b?: number | null;
  a_name: string | null;
  b_name: string | null;
  winner_name: string | null;
}

export interface BracketData {
  division: string;
  division_name?: string;
  decided_by?: 'judges' | 'audience';
  third_place_match?: boolean;
  match_format?: string | null;
  rules?: string[];
  rounds: number;
  matches: BracketMatchView[];
  placements: { entry: string; place: number; name?: string | null }[];
  votes?: Record<string, { a: number; b: number; mine: 'a' | 'b' | null }>;
}

export type BracketAction =
  | { type: 'vote'; match_id: string; pick: 'a' | 'b' }
  | { type: 'winner'; match_id: string; winner: string | null }
  | { type: 'status'; match_id: string; status: MatchStatus }
  | { type: 'poll'; match_id: string; votes_a: number | null; votes_b: number | null };

interface Props {
  division: string;
  /** Supabase access token (judge or staff). Without one the view is public. */
  token?: string | null;
  mode: 'public' | 'judge' | 'admin';
  /** Called after an action succeeds (the view reloads itself too). */
  onAction?: (action: BracketAction) => void;
  /** Called with every fresh load, e.g. to show placements next to the bracket. */
  onData?: (data: BracketData) => void;
  /** Poll interval. Default: public 10s while a match is live (60s otherwise), judge 3s, admin 5s. */
  pollMs?: number;
  /** Fixed data instead of fetching (previews and tests). */
  data?: BracketData;
  /** Change this to force a reload (e.g. after generating the bracket). */
  refreshKey?: number;
}

export function roundLabel(round: number, rounds: number): string {
  const left = rounds - round;
  if (left === 0) return 'Final';
  if (left === 1) return 'Semifinals';
  if (left === 2) return 'Quarterfinals';
  return `Round of ${2 ** (left + 1)}`;
}

const STYLE = `
.bv-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; max-width: 100%; padding-bottom: 0.5rem; }
.bv-cols { display: flex; gap: 1rem; align-items: stretch; min-width: min-content; }
.bv-col { display: flex; flex-direction: column; width: 230px; flex: 0 0 230px; }
.bv-col-body { display: flex; flex-direction: column; justify-content: space-around; gap: 0.75rem; flex: 1; }
@media (max-width: 640px) {
  .bv-cols { flex-direction: column; min-width: 0; }
  .bv-col { width: 100%; flex: none; }
  .bv-col-body { justify-content: flex-start; }
}
`;

const label: React.CSSProperties = {
  fontFamily: 'var(--font-condensed)', fontSize: '0.75rem', fontWeight: 800, letterSpacing: 'var(--caps-track)',
  textTransform: 'uppercase', color: 'var(--gold)',
};

const btn = (active: boolean, tone: 'gold' | 'red' | 'plain' = 'gold'): React.CSSProperties => ({
  background: active ? (tone === 'red' ? 'var(--red)' : tone === 'gold' ? 'var(--gold)' : 'var(--navy-border)') : 'transparent',
  color: active && tone === 'gold' ? 'var(--navy-deep)' : '#fff',
  border: '1px solid',
  borderColor: active ? (tone === 'red' ? 'var(--red)' : tone === 'gold' ? 'var(--gold)' : 'var(--navy-border)') : 'var(--navy-border)',
  padding: '0.5rem 0.9rem', fontWeight: 800, fontSize: '0.8rem', letterSpacing: '0.05em', cursor: 'pointer',
});

const canDecide = (m: BracketMatchView) => !!m.entry_a && !!m.entry_b;

export default function BracketView({ division, token, mode, onAction, onData, pollMs, data: fixture, refreshKey }: Props) {
  const [data, setData] = useState<BracketData | null>(fixture ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [poll, setPoll] = useState<{ a: string; b: string }>({ a: '', b: '' });
  const onDataRef = useRef(onData);
  useEffect(() => { onDataRef.current = onData; }, [onData]);

  const load = useCallback(async (): Promise<BracketData | null> => {
    if (fixture) return fixture;
    try {
      const res = await fetch(`/api/bracket?division=${encodeURIComponent(division)}`, {
        cache: 'no-store',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Could not load the bracket');
      setData(json as BracketData);
      setLoadError(null);
      return json as BracketData;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load the bracket');
      return null;
    }
  }, [division, token, fixture]);

  // Load, then keep polling. Public pages poll quickly only while a battle is live.
  useEffect(() => {
    if (fixture) { setData(fixture); return; }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const d = await load();
      if (stopped) return;
      const live = d?.matches.some((m) => m.status === 'live');
      const wait = pollMs ?? (mode === 'judge' ? 3000 : mode === 'admin' ? 5000 : live ? 10000 : 60000);
      timer = setTimeout(tick, wait);
    };
    tick();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [load, fixture, mode, pollMs, refreshKey]);

  useEffect(() => { if (data) onDataRef.current?.(data); }, [data]);

  // Clear the selection when the division changes.
  useEffect(() => { setSelectedId(null); setMsg(null); }, [division]);

  const matches = data?.matches ?? [];
  const live = matches.find((m) => m.status === 'live') ?? null;
  const selected = matches.find((m) => m.id === selectedId) ?? live;
  const audience = data?.decided_by === 'audience';

  // Poll inputs follow the selected match.
  const selKey = selected ? `${selected.id}:${selected.votes_a ?? ''}:${selected.votes_b ?? ''}` : '';
  useEffect(() => {
    if (!selected) return;
    setPoll({ a: selected.votes_a?.toString() ?? '', b: selected.votes_b?.toString() ?? '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey]);

  async function act(action: BracketAction) {
    if (!token || busy) return;
    setBusy(true);
    setMsg(null);
    const m = matches.find((x) => x.id === action.match_id);
    const [url, body] =
      action.type === 'vote' ? ['/api/bracket/vote', { match_id: action.match_id, pick: action.pick }]
      : action.type === 'winner' ? ['/api/admin/bracket/winner', { match_id: action.match_id, winner: action.winner, expected_updated_at: m?.updated_at }]
      : action.type === 'status' ? ['/api/admin/bracket/status', { match_id: action.match_id, status: action.status }]
      : ['/api/admin/bracket/votes', { match_id: action.match_id, votes_a: action.votes_a, votes_b: action.votes_b }];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ ok: false, text: json?.error?.message ?? 'That did not save. Try again.' });
      } else {
        setMsg({ ok: true, text: action.type === 'vote' ? 'Vote saved.' : action.type === 'poll' ? 'Poll counts saved.' : 'Saved.' });
        onAction?.(action);
      }
    } catch {
      setMsg({ ok: false, text: 'Network error. Try again.' });
    } finally {
      setBusy(false);
      await load();
    }
  }

  if (!data) {
    return (
      <p role="status" style={{ color: loadError ? '#ff6b6b' : 'var(--text-muted)' }}>
        {loadError ?? 'Loading bracket…'}
      </p>
    );
  }
  if (matches.length === 0) {
    return <p style={{ color: 'var(--text-muted)' }}>The bracket hasn&rsquo;t been drawn yet.</p>;
  }

  const rounds = data.rounds || Math.max(...matches.filter((m) => !m.is_third_place).map((m) => m.round));
  const third = matches.find((m) => m.is_third_place) ?? null;
  const interactive = mode !== 'public' && !!token;

  return (
    <div>
      <style>{STYLE}</style>

      {interactive && (
        <ControlPanel
          mode={mode}
          match={selected}
          rounds={rounds}
          audience={audience}
          votes={selected ? data.votes?.[selected.id] : undefined}
          busy={busy}
          poll={poll}
          setPoll={setPoll}
          act={act}
        />
      )}
      <p role="status" aria-live="polite" style={{ minHeight: '1.2rem', margin: '0.25rem 0 0.75rem', fontSize: '0.85rem', color: msg ? (msg.ok ? 'var(--gold-light)' : '#ff6b6b') : 'transparent' }}>
        {msg?.text ?? ''}
      </p>
      {loadError && <p style={{ color: '#ff6b6b', fontSize: '0.8rem' }}>Last refresh failed: {loadError}</p>}

      <div className="bv-scroll" role="region" aria-label={`${data.division_name ?? division} bracket`} tabIndex={0}>
        <div className="bv-cols">
          {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => (
            <section key={r} className="bv-col" aria-label={roundLabel(r, rounds)}>
              <h3 style={{ ...label, margin: '0 0 0.5rem' }}>{roundLabel(r, rounds)}</h3>
              <div className="bv-col-body">
                {matches.filter((m) => !m.is_third_place && m.round === r).sort((a, b) => a.position - b.position).map((m) => (
                  <MatchCard
                    key={m.id}
                    m={m}
                    rounds={rounds}
                    audience={audience}
                    mode={mode}
                    selected={interactive && selected?.id === m.id}
                    mine={data.votes?.[m.id]?.mine ?? null}
                    onSelect={interactive ? () => setSelectedId(m.id) : undefined}
                  />
                ))}
                {r === rounds && third && (
                  <div>
                    <div style={{ ...label, color: 'var(--text-muted)', margin: '0.5rem 0 0.35rem' }}>Third-place match</div>
                    <MatchCard
                      m={third}
                      rounds={rounds}
                      audience={audience}
                      mode={mode}
                      selected={interactive && selected?.id === third.id}
                      mine={data.votes?.[third.id]?.mine ?? null}
                      onSelect={interactive ? () => setSelectedId(third.id) : undefined}
                    />
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function matchTitle(m: BracketMatchView, rounds: number) {
  return m.is_third_place ? 'Third-place match' : `${roundLabel(m.round, rounds)}${m.round < rounds ? `, match ${m.position}` : ''}`;
}

function MatchCard({ m, rounds, audience, mode, selected, mine, onSelect }: {
  m: BracketMatchView; rounds: number; audience: boolean; mode: Props['mode'];
  selected: boolean; mine: 'a' | 'b' | null; onSelect?: () => void;
}) {
  const isLive = m.status === 'live';
  const bye = (m.entry_a === null) !== (m.entry_b === null) && m.round === 1;
  const showCounts = audience && (mode === 'admin' || m.status === 'done') && (m.votes_a != null || m.votes_b != null);
  const side = (slot: 'a' | 'b') => {
    const id = slot === 'a' ? m.entry_a : m.entry_b;
    const name = slot === 'a' ? m.a_name : m.b_name;
    const won = !!id && m.winner === id;
    const lost = !!m.winner && !!id && !won;
    const count = slot === 'a' ? m.votes_a : m.votes_b;
    return (
      <span
        style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.6rem',
          background: won ? 'rgba(201, 168, 76, 0.18)' : 'transparent',
          borderLeft: `3px solid ${won ? 'var(--gold)' : 'transparent'}`,
          color: won ? '#fff' : lost ? 'var(--text-muted)' : id ? 'var(--text-body)' : 'var(--text-muted)',
          fontWeight: won ? 800 : 600, fontSize: '0.9rem', textAlign: 'left',
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: id ? 'normal' : 'italic' }}>
          {id ? name : bye ? 'Bye' : 'TBD'}
        </span>
        {showCounts && <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{count ?? 0}</span>}
        {mode === 'judge' && mine === slot && <span style={{ fontSize: '0.65rem', color: 'var(--gold)', fontWeight: 800 }}>YOUR VOTE</span>}
        {won && <span aria-label="winner" style={{ color: 'var(--gold)' }}>✓</span>}
      </span>
    );
  };

  const inner = (
    <>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.25rem 0.6rem', borderBottom: '1px solid var(--navy-border)' }}>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>
          {m.is_third_place ? '3rd place' : `Match ${m.position}`}
        </span>
        {isLive && (
          <span style={{ background: 'var(--red)', color: '#fff', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.12em', padding: '0.1rem 0.4rem' }}>
            LIVE
          </span>
        )}
      </span>
      {side('a')}
      <span style={{ display: 'block', height: 1, background: 'var(--navy-border)' }} />
      {side('b')}
    </>
  );

  const box: React.CSSProperties = {
    display: 'block', width: '100%', padding: 0, background: 'var(--navy)', color: 'inherit', font: 'inherit',
    border: `${isLive || selected ? 2 : 1}px solid ${selected ? 'var(--gold-light)' : isLive ? 'var(--red)' : 'var(--navy-border)'}`,
    opacity: !m.entry_a && !m.entry_b ? 0.7 : 1,
  };
  const desc = `${matchTitle(m, rounds)}: ${m.a_name ?? 'TBD'} vs ${m.b_name ?? 'TBD'}${m.winner_name ? `, won by ${m.winner_name}` : ''}${isLive ? ', live now' : ''}`;

  if (onSelect && canDecide(m)) {
    return (
      <button type="button" onClick={onSelect} aria-label={`Select ${desc}`} aria-current={selected ? 'true' : undefined} style={{ ...box, cursor: 'pointer' }}>
        {inner}
      </button>
    );
  }
  return <div role="group" aria-label={desc} style={box}>{inner}</div>;
}

function ControlPanel({ mode, match, rounds, audience, votes, busy, poll, setPoll, act }: {
  mode: Props['mode']; match: BracketMatchView | null; rounds: number; audience: boolean;
  votes?: { a: number; b: number; mine: 'a' | 'b' | null }; busy: boolean;
  poll: { a: string; b: string }; setPoll: (p: { a: string; b: string }) => void;
  act: (a: BracketAction) => void;
}) {
  const panel: React.CSSProperties = { background: 'var(--navy)', border: '1px solid var(--navy-border)', borderTop: '2px solid var(--gold)', padding: '1rem', marginBottom: '0.5rem' };
  if (!match) {
    return (
      <div style={panel}>
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>
          {mode === 'judge' ? 'No battle is live. Waiting for the next one, or tap a match to select it.' : 'No battle is live. Tap a match to run it.'}
        </p>
      </div>
    );
  }
  const title = matchTitle(match, rounds);
  const a = match.a_name ?? 'TBD', b = match.b_name ?? 'TBD';
  const ready = canDecide(match);

  if (mode === 'judge') {
    return (
      <div style={panel}>
        <div style={{ ...label, marginBottom: '0.5rem' }}>{title}{match.status === 'live' ? ' · Live' : ''}</div>
        {audience ? (
          <p style={{ margin: 0, color: 'var(--text-body)', fontWeight: 600 }}>This battle is decided by the audience poll.</p>
        ) : match.winner ? (
          <p style={{ margin: 0, color: 'var(--text-body)' }}>Winner confirmed: <strong style={{ color: '#fff' }}>{match.winner_name}</strong></p>
        ) : !ready ? (
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>Waiting for both battlers.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
            {(['a', 'b'] as const).map((s) => {
              const pressed = votes?.mine === s;
              const name = s === 'a' ? a : b;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={busy}
                  aria-pressed={pressed}
                  aria-label={`Vote for ${name}`}
                  onClick={() => act({ type: 'vote', match_id: match.id, pick: s })}
                  style={{ ...btn(pressed), padding: '1.25rem 0.75rem', fontSize: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', minHeight: 96 }}
                >
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', lineHeight: 1 }}>{s.toUpperCase()}</span>
                  <span style={{ overflowWrap: 'anywhere' }}>{name}</span>
                  {pressed && <span style={{ fontSize: '0.65rem', letterSpacing: '0.1em' }}>YOUR VOTE</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Admin
  const suggestion: 'a' | 'b' | null = audience
    ? (() => {
        const w = pollWinner(match);
        return w === null ? null : w === match.entry_a ? 'a' : 'b';
      })()
    : majorityPick([...Array(votes?.a ?? 0).fill('a'), ...Array(votes?.b ?? 0).fill('b')]);
  const suggestedName = suggestion === 'a' ? a : suggestion === 'b' ? b : null;
  const numInput: React.CSSProperties = { width: '100%', padding: '0.5rem', background: '#0d1428', border: '1px solid var(--navy-border)', color: '#fff', fontFamily: 'monospace', fontSize: '1rem', textAlign: 'center' };
  const pollChanged = poll.a !== (match.votes_a?.toString() ?? '') || poll.b !== (match.votes_b?.toString() ?? '');
  const toCount = (s: string) => (s.trim() === '' ? null : Math.max(0, Math.floor(Number(s))));

  return (
    <div style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'baseline', marginBottom: '0.75rem' }}>
        <div style={label}>{title} · {match.status}</div>
        <div style={{ color: 'var(--text-body)', fontSize: '0.9rem' }}>
          <strong style={{ color: '#fff' }}>{a}</strong> vs <strong style={{ color: '#fff' }}>{b}</strong>
        </div>
      </div>

      {ready && (audience ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem', alignItems: 'end', marginBottom: '0.75rem' }}>
          <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>
            Poll votes A
            <input type="number" min={0} inputMode="numeric" value={poll.a} onChange={(e) => setPoll({ ...poll, a: e.target.value })} style={numInput} aria-label={`Poll votes for ${a}`} />
          </label>
          <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>
            Poll votes B
            <input type="number" min={0} inputMode="numeric" value={poll.b} onChange={(e) => setPoll({ ...poll, b: e.target.value })} style={numInput} aria-label={`Poll votes for ${b}`} />
          </label>
          <button type="button" disabled={busy || !pollChanged} style={btn(pollChanged)}
            onClick={() => act({ type: 'poll', match_id: match.id, votes_a: toCount(poll.a), votes_b: toCount(poll.b) })}>
            Save counts
          </button>
        </div>
      ) : (
        <p style={{ margin: '0 0 0.75rem', color: 'var(--text-body)', fontSize: '0.9rem' }}>
          Judge votes: <strong style={{ color: '#fff' }}>A {votes?.a ?? 0}</strong> · <strong style={{ color: '#fff' }}>B {votes?.b ?? 0}</strong>
          {' '}<span style={{ color: 'var(--text-muted)' }}>({suggestedName ? `majority: ${suggestedName}` : (votes?.a ?? 0) + (votes?.b ?? 0) ? 'tied' : 'no votes yet'})</span>
        </p>
      ))}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {ready && (['a', 'b'] as const).map((s) => {
          const id = s === 'a' ? match.entry_a : match.entry_b;
          const name = s === 'a' ? a : b;
          const isWinner = match.winner === id;
          return (
            <button key={s} type="button" disabled={busy || isWinner} aria-pressed={isWinner}
              aria-label={`Confirm ${name} as the winner${suggestion === s ? ' (suggested)' : ''}`}
              onClick={() => act({ type: 'winner', match_id: match.id, winner: id })}
              style={{ ...btn(isWinner || suggestion === s), outline: suggestion === s && !isWinner ? '2px dashed var(--gold-light)' : undefined, outlineOffset: 2 }}>
              Confirm {s.toUpperCase()}{suggestion === s ? ' (suggested)' : ''}
            </button>
          );
        })}
        {match.winner && (
          <button type="button" disabled={busy} style={btn(false)} onClick={() => act({ type: 'winner', match_id: match.id, winner: null })}>
            Clear winner
          </button>
        )}
        {ready && !match.winner && match.status !== 'live' && (
          <button type="button" disabled={busy} style={btn(true, 'red')} onClick={() => act({ type: 'status', match_id: match.id, status: 'live' })}>
            Set live
          </button>
        )}
        {match.status === 'live' && (
          <button type="button" disabled={busy} style={btn(false)} onClick={() => act({ type: 'status', match_id: match.id, status: 'pending' })}>
            Not live
          </button>
        )}
      </div>
      {audience && ready && !match.winner && (
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {suggestedName ? `Suggested winner from the poll: ${suggestedName}. Save the counts, then confirm.` : 'Enter the poll counts, save, then confirm the winner.'}
        </p>
      )}
    </div>
  );
}

const ORDINAL = ['1st', '2nd', '3rd', '4th'];
const PLACE_COLORS = ['var(--gold)', '#c7c7d1', '#cd7f32', 'var(--text-muted)'];

/** Placements so far (from bracketPlacements via the API). */
export function BracketPlacements({ placements }: { placements: BracketData['placements'] }) {
  if (placements.length === 0) return <p style={{ color: 'var(--text-muted)', margin: 0 }}>No placements yet.</p>;
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.4rem' }}>
      {placements.map((p) => (
        <li key={`${p.place}-${p.entry}`} style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline', background: 'var(--navy)', border: '1px solid var(--navy-border)', borderLeft: `3px solid ${PLACE_COLORS[p.place - 1] ?? 'var(--navy-border)'}`, padding: '0.5rem 0.75rem' }}>
          <span style={{ ...label, color: PLACE_COLORS[p.place - 1] ?? 'var(--text-muted)', minWidth: '2.5rem' }}>{ORDINAL[p.place - 1] ?? `${p.place}th`}</span>
          <span style={{ color: '#fff', fontWeight: 700, overflowWrap: 'anywhere' }}>{p.name ?? 'Unnamed competitor'}</span>
        </li>
      ))}
    </ol>
  );
}

/** Public bracket with its placements above it (used by /results/bracket). */
export function PublicBracket({ division, data: fixture }: { division: string; data?: BracketData }) {
  const [placements, setPlacements] = useState<BracketData['placements']>(fixture?.placements ?? []);
  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <section aria-labelledby="bv-placements">
        <h2 id="bv-placements" style={{ ...label, fontSize: '0.85rem', margin: '0 0 0.5rem' }}>Placements</h2>
        <BracketPlacements placements={placements} />
      </section>
      <section aria-labelledby="bv-bracket">
        <h2 id="bv-bracket" style={{ ...label, fontSize: '0.85rem', margin: '0 0 0.5rem' }}>Bracket</h2>
        <BracketView division={division} mode="public" data={fixture} onData={(d) => setPlacements(d.placements)} />
      </section>
    </div>
  );
}
