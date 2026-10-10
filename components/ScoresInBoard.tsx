'use client';

import { useEffect, useState } from 'react';

import { DIVISIONS } from '@/lib/standings';
import { divisionByCode } from '@/contest.config';
import { roundsOf } from '@/lib/divisions-core';
import { buildScoresInBoard, owedBy, owedLine } from '@/lib/scores-in-board';
import type { ScoreStatus } from '@/lib/score-status';

const POLL_MS = 10000;

type Loaded = { key: string; status: ScoreStatus } | { key: string; error: true };

/**
 * Scores-in board (master plan T1): competitors down the side, judges across the top, a filled square
 * when that judge's score has landed. Reads /api/admin/score-status, so it needs the scores.review
 * capability. With `judgeName`, it also says what that judge still owes.
 */
export default function ScoresInBoard({ token, judgeName, compact = false }: { token: string; judgeName?: string; compact?: boolean }) {
  const [division, setDivision] = useState(DIVISIONS[0]?.code ?? '');
  const [round, setRound] = useState(1);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const rounds = roundsOf(divisionByCode(division));
  const key = `${division}:${round}`;

  useEffect(() => {
    if (!division) return;
    let live = true;
    const load = () => {
      fetch(`/api/admin/score-status?division=${encodeURIComponent(division)}&round=${round}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error('bad response'))))
        .then((data: ScoreStatus) => { if (live) setLoaded({ key, status: data }); })
        .catch(() => { if (live) setLoaded({ key, error: true }); });
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => { live = false; clearInterval(id); };
  }, [division, round, token, key]);

  const current = loaded && loaded.key === key ? loaded : null;
  const status = current && 'status' in current ? current.status : null;
  const board = status ? buildScoresInBoard(status) : null;
  const owed = status && judgeName ? owedLine(owedBy(status, judgeName)) : null;

  const pill = (active: boolean) => ({
    padding: '0.4rem 0.8rem',
    fontSize: '0.7rem',
    fontWeight: 800,
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
    border: `1px solid ${active ? 'var(--gold)' : 'var(--navy-border)'}`,
    background: active ? 'var(--gold)' : 'transparent',
    color: active ? 'var(--navy-deep)' : 'var(--text-muted)',
    cursor: 'pointer',
  });

  return (
    <div>
      {!compact && <h3 style={{ fontSize: '0.8rem', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>Scores In</h3>}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        {DIVISIONS.map(({ code, label }) => (
          <button key={code} type="button" aria-pressed={division === code} onClick={() => { setDivision(code); setRound(1); }} style={pill(division === code)}>
            {label}
          </button>
        ))}
      </div>
      {rounds.length > 1 && (
        <div role="group" aria-label="Round" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          {rounds.map((r, i) => (
            <button key={r.name} type="button" aria-pressed={round === i + 1} onClick={() => setRound(i + 1)} style={pill(round === i + 1)}>
              {r.name}
            </button>
          ))}
        </div>
      )}

      {owed && <p role="status" style={{ color: 'var(--gold)', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.75rem' }}>{owed}</p>}

      {!current ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading scores…</p>
      ) : 'error' in current ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Couldn&rsquo;t load the scores for this round. Pick another division or refresh.</p>
      ) : !board || board.rows.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No run order set for this round yet.</p>
      ) : (
        <>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
            {board.filled} of {board.total} scores in ({board.percent}%){board.full ? ' · Board is full' : ''}
          </p>
          {board.judges.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No judge has entered a score yet.</p>
          ) : (
            <div className="table-wrap" style={{ overflowX: 'auto' }} tabIndex={0} role="region" aria-label="Scores-in board">
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th scope="col" style={{ textAlign: 'left', padding: '0.4rem 0.6rem' }}>Competitor</th>
                    {board.judges.map((j) => (
                      <th key={j} scope="col" style={{ padding: '0.4rem 0.6rem', fontSize: '0.7rem' }}>{j}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {board.rows.map((r) => (
                    <tr key={r.registration_id} style={{ borderTop: '1px solid var(--navy-border)' }}>
                      <th scope="row" style={{ textAlign: 'left', padding: '0.4rem 0.6rem', fontWeight: 600 }}>{r.name}</th>
                      {r.cells.map((ok, i) => (
                        <td key={board.judges[i]} style={{ textAlign: 'center', padding: '0.4rem 0.6rem' }}>
                          <span
                            role="img"
                            aria-label={ok ? 'Score in' : r.run_status === 'done' ? 'Score missing' : 'Not scored yet'}
                            style={{
                              display: 'inline-block',
                              width: '1.1rem',
                              height: '1.1rem',
                              border: `2px solid ${ok ? 'var(--gold)' : r.run_status === 'done' ? '#ff6b6b' : 'var(--navy-border)'}`,
                              background: ok ? 'var(--gold)' : 'transparent',
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
