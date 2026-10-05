'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { DIVISIONS } from '@/lib/standings';
import { divisionByCode } from '@/contest.config';
import { roundsOf } from '@/lib/divisions-core';

type Division = string;
type Status = 'upcoming' | 'performing' | 'done';

interface Performer {
  position: number;
  status: Status;
  registration_id: string;
  display_name: string;
  style: string | null;
}

const STATUS_LABEL: Record<Status, string> = {
  upcoming: 'Up next',
  performing: 'Now performing',
  done: 'Done',
};

// Matches the ~15s public cache window on GET /api/run-order.
const POLL_MS = 15000;

export default function RunOrderBoard() {
  const [division, setDivision] = useState<Division>(DIVISIONS[0]?.code ?? '');
  const [round, setRound] = useState(1);
  const rounds = roundsOf(divisionByCode(division));
  const [performers, setPerformers] = useState<Performer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRunOrder = useCallback(async (div: Division, rnd: number) => {
    try {
      const res = await fetch(`/api/run-order?division=${encodeURIComponent(div)}&round=${rnd}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('bad response');
      const data = await res.json();
      const list: Performer[] = (data.performers ?? []).map((p: Performer) => ({
        position: p.position,
        status: p.status,
        registration_id: p.registration_id,
        display_name: p.display_name,
        style: p.style ?? null,
      }));
      setPerformers(list);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchRunOrder(division, round);

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => fetchRunOrder(division, round), POLL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [division, round, fetchRunOrder]);

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {DIVISIONS.map(({ code, label }) => (
          <button
            key={code}
            type="button"
            onClick={() => { setDivision(code); setRound(1); }}
            aria-pressed={division === code}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.75rem',
              fontWeight: 800,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              border: '1px solid var(--navy-border)',
              background: division === code ? 'var(--gold)' : 'transparent',
              color: division === code ? 'var(--navy-deep)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {rounds.length > 1 && (
        <div role="group" aria-label="Round" style={{ display: 'flex', gap: '0.5rem', marginTop: '-0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {rounds.map((r, i) => (
            <button
              key={r.name}
              type="button"
              onClick={() => setRound(i + 1)}
              aria-pressed={round === i + 1}
              style={{
                padding: '0.35rem 0.8rem',
                fontSize: '0.7rem',
                fontWeight: 700,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                border: `1px solid ${round === i + 1 ? 'var(--gold)' : 'var(--navy-border)'}`,
                background: 'transparent',
                color: round === i + 1 ? 'var(--gold)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading run order…</p>
      ) : error ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Couldn&rsquo;t load the run order. Refresh to try again.
        </p>
      ) : performers.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          {round > 1 ? `No one has advanced to ${rounds[round - 1]?.name ?? 'this round'} yet.` : 'No run order set for this division yet.'}
        </p>
      ) : (
        <div style={{ border: '1px solid var(--navy-border)' }}>
          {performers.map((p, i) => {
            const isPerforming = p.status === 'performing';
            const isDone = p.status === 'done';
            return (
              <div
                key={p.registration_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.85rem 1rem',
                  borderBottom: i < performers.length - 1 ? '1px solid var(--navy-border)' : 'none',
                  background: isPerforming ? '#1a1400' : i % 2 === 0 ? 'var(--navy)' : 'transparent',
                  opacity: isDone ? 0.55 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minWidth: 0 }}>
                  <span
                    style={{
                      width: '1.75rem',
                      flexShrink: 0,
                      textAlign: 'center',
                      fontSize: '0.95rem',
                      fontWeight: 800,
                      color: isPerforming ? 'var(--gold)' : 'var(--text-muted)',
                    }}
                  >
                    {p.position}
                  </span>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: '0.5rem',
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.95rem',
                        fontWeight: 700,
                        color: isPerforming ? 'var(--gold)' : '#fff',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {p.display_name}
                    </div>
                    {p.style && (
                      <span
                        style={{
                          fontSize: '0.65rem',
                          fontWeight: 800,
                          letterSpacing: '0.05em',
                          color: 'var(--navy-deep)',
                          background: 'var(--gold)',
                          padding: '0.1rem 0.4rem',
                          flexShrink: 0,
                        }}
                      >
                        {p.style}
                      </span>
                    )}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    color: isPerforming ? 'var(--gold)' : 'var(--text-muted)',
                    flexShrink: 0,
                    paddingLeft: '1rem',
                  }}
                >
                  {STATUS_LABEL[p.status]}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
