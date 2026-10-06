'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';
import { divisionByCode } from '@/contest.config';
import { compareLadder, formatSummary, ladderNext, ladderResult, type LadderAttempt, type LadderResult } from '@/lib/divisions-core';

/**
 * Judge's trick-ladder sheet (format "ladder"). Loads GET /api/ladder with the judge's bearer
 * token, records each try with POST /api/ladder and undoes the last one with DELETE.
 * Built for a phone at the judging table: the current trick is shown large with a big
 * LANDED / MISSED pair. Updates are optimistic and reconciled with the server's entry.
 */

interface Attempt extends LadderAttempt {
  created_at?: string;
}

interface Entry {
  registration_id: string;
  display_name: string;
  attempts: Attempt[];
  result: LadderResult;
}

interface LadderResponse {
  entries?: Entry[];
  error?: { message?: string };
}

interface EntryResponse {
  registration_id?: string;
  attempts?: Attempt[];
  result?: LadderResult;
  error?: { message?: string };
}

const supabase = createBrowserClient();

const label = { fontSize: '0.6rem', letterSpacing: '0.16em', fontWeight: 800, color: 'var(--gold)' } as const;

/** The attempt recorded last: newest created_at, else the highest trick/attempt. */
function lastAttempt(rows: Attempt[]): Attempt | null {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) =>
    (b.created_at ?? '').localeCompare(a.created_at ?? '') || b.trick_index - a.trick_index || b.attempt - a.attempt)[0];
}

export default function LadderSheet({ division, token: tokenProp }: { division: string; token?: string | null }) {
  const divDef = divisionByCode(division);
  const sc = divDef?.scoring.format === 'ladder' ? divDef.scoring : null;

  const [token, setToken] = useState<string | null>(tokenProp ?? null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const pendingRef = useRef(0);

  // Same auth pattern as the judge page: the Supabase session's access token.
  useEffect(() => {
    if (tokenProp) { setToken(tokenProp); return; }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setToken(data.session?.access_token ?? null);
    });
    return () => { active = false; };
  }, [tokenProp]);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/ladder?division=${encodeURIComponent(division)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as LadderResponse;
      // Don't clobber an optimistic update that's still in flight.
      if (pendingRef.current > 0) return;
      if (res.ok) setEntries(json.entries ?? []);
      else setMsg({ ok: false, text: json.error?.message ?? 'Could not load the ladder.' });
    } catch {
      // Keep existing UI state on transient failures.
    } finally {
      setLoaded(true);
    }
  }, [division, token]);

  useEffect(() => {
    setEntries([]);
    setSelectedId(null);
    setLoaded(false);
    setMsg(null);
  }, [division]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  if (!sc || !divDef) return null;
  const n = sc.tricks.length;
  const rankByPoints = (sc.rankBy ?? 'rung') === 'points';

  const selected = entries.find((e) => e.registration_id === selectedId) ?? null;
  // Recompute from the attempts so the next try always matches what's on screen.
  const next = selected ? ladderNext(ladderResult(selected.attempts, sc), selected.attempts, sc) : null;
  const undoTarget = selected ? lastAttempt(selected.attempts) : null;

  const standing = (r: LadderResult) => (rankByPoints ? `${r.points} pts` : `Rung ${r.rung}/${n}`);
  const stateOf = (r: LadderResult) => (!r.done ? 'climbing' : !rankByPoints && r.rung < n ? 'out' : 'done');

  /** Replace one entry locally and keep the list in ranking order. */
  const putEntry = (id: string, attempts: Attempt[], result?: LadderResult) => {
    setEntries((prev) => prev
      .map((e) => (e.registration_id === id ? { ...e, attempts, result: result ?? ladderResult(attempts, sc) } : e))
      .sort((a, b) => compareLadder(sc)(a.result, b.result)));
  };

  async function send(method: 'POST' | 'DELETE', body: Record<string, unknown>, optimistic: Attempt[], before: Attempt[], okText: string) {
    if (!token || !selected) return;
    const id = selected.registration_id;
    putEntry(id, optimistic);
    pendingRef.current += 1;
    setPending((p) => p + 1);
    setMsg(null);
    try {
      const res = await fetch('/api/ladder', {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ division, registration_id: id, ...body }),
      });
      const json = await res.json() as EntryResponse;
      if (res.ok && json.attempts) {
        putEntry(id, json.attempts, json.result);
        setMsg({ ok: true, text: okText });
      } else {
        putEntry(id, before);
        setMsg({ ok: false, text: json.error?.message ?? 'Not saved - try again.' });
      }
    } catch {
      putEntry(id, before);
      setMsg({ ok: false, text: 'Network error - not saved.' });
    } finally {
      pendingRef.current -= 1;
      setPending((p) => p - 1);
    }
  }

  function record(landed: boolean) {
    if (!selected || !next) return;
    const before = selected.attempts;
    const row: Attempt = { trick_index: next.trick_index, attempt: next.attempt, landed, created_at: new Date().toISOString() };
    send('POST', { trick_index: next.trick_index, attempt: next.attempt, landed }, [...before, row], before,
      `${sc!.tricks[next.trick_index].name}, attempt ${next.attempt}: ${landed ? 'landed' : 'missed'}`);
  }

  function flip(a: Attempt) {
    if (!selected) return;
    const before = selected.attempts;
    const after = before.map((r) => (r.trick_index === a.trick_index && r.attempt === a.attempt ? { ...r, landed: !a.landed } : r));
    send('POST', { trick_index: a.trick_index, attempt: a.attempt, landed: !a.landed }, after, before,
      `Changed ${sc!.tricks[a.trick_index].name}, attempt ${a.attempt} to ${a.landed ? 'missed' : 'landed'}`);
  }

  function undo() {
    if (!selected || !undoTarget) return;
    const before = selected.attempts;
    const after = before.filter((r) => !(r.trick_index === undoTarget.trick_index && r.attempt === undoTarget.attempt));
    send('DELETE', { trick_index: undoTarget.trick_index, attempt: undoTarget.attempt }, after, before,
      `Undid ${sc!.tricks[undoTarget.trick_index].name}, attempt ${undoTarget.attempt}`);
  }

  const busy = pending > 0;
  const bigButton = (bg: string, fg: string, disabled: boolean) => ({
    flex: 1,
    minHeight: 72,
    background: disabled ? 'var(--navy-border)' : bg,
    color: disabled ? 'var(--text-muted)' : fg,
    border: 'none',
    fontWeight: 900,
    fontSize: '1.15rem',
    letterSpacing: '0.12em',
    cursor: disabled ? 'not-allowed' : 'pointer',
  });

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'flex-start' }}>
      <section style={{ flex: '1 1 260px', minWidth: 0 }} aria-label="Entrants">
        <div style={{ ...label, marginBottom: '0.5rem' }}>ENTRANTS ({entries.length})</div>
        <div style={{ border: '1px solid var(--navy-border)' }}>
          {entries.length === 0 ? (
            <div style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', background: 'var(--navy)' }}>
              {loaded ? 'No paid entrants yet.' : 'Loading…'}
            </div>
          ) : entries.map((e) => {
            const st = stateOf(e.result);
            const used = e.attempts.length;
            return (
              <button
                key={e.registration_id}
                type="button"
                aria-pressed={selectedId === e.registration_id}
                onClick={() => { setSelectedId(e.registration_id); setMsg(null); }}
                style={{
                  width: '100%', textAlign: 'left', border: 'none', borderBottom: '1px solid var(--navy-border)',
                  background: selectedId === e.registration_id ? '#1a1400' : 'var(--navy)',
                  padding: '0.65rem 0.9rem', color: '#fff', cursor: 'pointer',
                  display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.15rem 0.6rem', alignItems: 'center',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>{e.display_name}</span>
                <span style={{ fontFamily: 'monospace', color: 'var(--gold)', fontWeight: 800, fontSize: '0.85rem' }}>{standing(e.result)}</span>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{used} {used === 1 ? 'try' : 'tries'} · {e.result.attemptsUsed} counted</span>
                <span style={{
                  fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800,
                  color: st === 'out' ? '#ff6b6b' : st === 'done' ? '#7fff7f' : 'var(--text-muted)',
                }}>
                  {st}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section style={{ flex: '999 1 320px', minWidth: 0, background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '1rem' }} aria-label="Ladder sheet">
        <div style={{ ...label, marginBottom: '0.5rem' }} title={formatSummary(divDef)}>TRICK LADDER</div>

        {!selected ? (
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Select an entrant.</p>
        ) : (
          <>
            <div style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 700, overflowWrap: 'anywhere' }}>{selected.display_name}</div>
            <div aria-live="polite" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1rem' }}>
              <span style={{ color: 'var(--gold)', fontFamily: 'monospace', fontWeight: 800 }}>{standing(selected.result)}</span>
              {' · '}{selected.result.attemptsUsed} attempts counted
              {selected.result.done && (stateOf(selected.result) === 'out' ? ' · OUT' : ' · FINISHED')}
            </div>

            <div style={{ border: '1px solid var(--navy-border)', background: '#0d1428', padding: '1rem', marginBottom: '0.8rem', textAlign: 'center' }}>
              {next ? (
                <>
                  <div style={{ ...label, color: 'var(--text-muted)' }}>
                    TRICK {next.trick_index + 1} OF {n} · ATTEMPT {next.attempt} OF {sc.attemptsPerTrick}
                  </div>
                  <div aria-live="polite" style={{ color: '#fff', fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 'clamp(1.6rem, 8vw, 2.4rem)', lineHeight: 1.15, margin: '0.4rem 0 0', overflowWrap: 'anywhere' }}>
                    {sc.tricks[next.trick_index].name}
                  </div>
                  {sc.tricks[next.trick_index].points !== undefined && (
                    <div style={{ color: 'var(--gold)', fontSize: '0.8rem', marginTop: '0.2rem' }}>{sc.tricks[next.trick_index].points} pts</div>
                  )}
                </>
              ) : (
                <div style={{ color: stateOf(selected.result) === 'out' ? '#ff6b6b' : '#7fff7f', fontWeight: 800, fontSize: '1.3rem', letterSpacing: '0.1em' }}>
                  {stateOf(selected.result) === 'out' ? 'OUT' : 'FINISHED'}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.6rem' }}>
              <button type="button" onClick={() => record(true)} disabled={!next || busy} style={bigButton('var(--gold)', 'var(--navy-deep)', !next || busy)}>
                LANDED
              </button>
              <button type="button" onClick={() => record(false)} disabled={!next || busy} style={bigButton('var(--red)', '#fff', !next || busy)}>
                MISSED
              </button>
            </div>
            <button
              type="button"
              onClick={undo}
              disabled={!undoTarget || busy}
              style={{
                width: '100%', background: 'transparent', border: '1px solid var(--navy-border)',
                color: !undoTarget || busy ? 'var(--text-muted)' : '#fff', padding: '0.6rem', fontWeight: 800,
                fontSize: '0.75rem', letterSpacing: '0.08em', cursor: !undoTarget || busy ? 'not-allowed' : 'pointer', marginBottom: '0.6rem',
              }}
            >
              UNDO{undoTarget ? ` (${sc.tricks[undoTarget.trick_index].name}, attempt ${undoTarget.attempt})` : ''}
            </button>

            {msg && <p role="status" style={{ color: msg.ok ? '#7fff7f' : '#ff6b6b', fontSize: '0.8rem', margin: '0 0 0.8rem' }}>{msg.text}</p>}

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <caption style={{ ...label, textAlign: 'left', paddingBottom: '0.4rem' }}>TRICKS (tap a recorded try to change it)</caption>
              <thead>
                <tr>
                  <th scope="col" style={{ textAlign: 'left', color: 'var(--text-muted)', fontWeight: 700, padding: '0.3rem 0.2rem' }}>Trick</th>
                  {Array.from({ length: sc.attemptsPerTrick }, (_, i) => (
                    <th key={i} scope="col" style={{ color: 'var(--text-muted)', fontWeight: 700, padding: '0.3rem 0.2rem', width: '2.6rem' }}>{i + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sc.tricks.map((t, ti) => {
                  const current = next?.trick_index === ti;
                  return (
                    <tr key={ti} style={{ borderTop: '1px solid var(--navy-border)', background: current ? '#1a1400' : undefined }}>
                      <th scope="row" style={{ textAlign: 'left', color: current ? 'var(--gold)' : '#fff', fontWeight: current ? 800 : 600, padding: '0.35rem 0.2rem', overflowWrap: 'anywhere' }}>
                        {ti + 1}. {t.name}
                      </th>
                      {Array.from({ length: sc.attemptsPerTrick }, (_, ai) => {
                        const a = selected.attempts.find((r) => r.trick_index === ti && r.attempt === ai + 1);
                        const cellName = `${t.name}, attempt ${ai + 1}`;
                        return (
                          <td key={ai} style={{ textAlign: 'center', padding: '0.2rem' }}>
                            {a ? (
                              <button
                                type="button"
                                onClick={() => flip(a)}
                                disabled={busy}
                                aria-label={`${cellName}: ${a.landed ? 'landed' : 'missed'}. Change to ${a.landed ? 'missed' : 'landed'}`}
                                style={{
                                  width: '2.2rem', height: '2rem', border: '1px solid',
                                  borderColor: a.landed ? 'var(--gold)' : 'var(--red)',
                                  background: a.landed ? 'var(--gold)' : 'transparent',
                                  color: a.landed ? 'var(--navy-deep)' : '#ff6b6b',
                                  fontWeight: 900, cursor: busy ? 'not-allowed' : 'pointer',
                                }}
                              >
                                {a.landed ? '✓' : '✗'}
                              </button>
                            ) : (
                              <span role="img" aria-label={`${cellName}: not tried`} style={{ display: 'inline-block', width: '2.2rem', height: '2rem', lineHeight: '2rem', border: '1px solid var(--navy-border)', color: 'var(--text-muted)' }}>
                                ·
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </section>
    </div>
  );
}
