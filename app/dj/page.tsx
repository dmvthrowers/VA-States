'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const DIVISIONS = ['1A', 'X', 'SBJ'] as const;
type Division = typeof DIVISIONS[number];

interface Performer {
  position: number;
  status: 'upcoming' | 'performing' | 'done';
  registration_id: string;
  display_name: string;
  city: string | null;
  state: string | null;
  music_filename: string | null;
}

interface RunOrderResponse {
  division: Division;
  source: 'run_order' | 'registration_order';
  performers: Performer[];
}

const PIN_KEY = 'vsyc26_dj_pin';

function statusColor(status: Performer['status']) {
  if (status === 'performing') return 'var(--gold)';
  if (status === 'done') return 'var(--text-muted)';
  return '#fff';
}

function statusBg(status: Performer['status']) {
  if (status === 'performing') return '#1a1400';
  if (status === 'done') return 'transparent';
  return 'var(--navy)';
}

export default function DJPage() {
  const [pin, setPin] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [division, setDivision] = useState<Division>('1A');
  const [data, setData] = useState<RunOrderResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check stored pin on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(PIN_KEY);
    if (stored) setPin(stored);
  }, []);

  const fetchRunOrder = useCallback(async (div: Division) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/run-order?division=${div}`);
      if (res.ok) {
        const json: RunOrderResponse = await res.json();
        setData(json);
        setLastRefresh(new Date());
      }
    } catch {
      // silent — keep stale data
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll every 15 seconds when authenticated
  useEffect(() => {
    if (!pin) return;
    fetchRunOrder(division);
    pollingRef.current = setInterval(() => fetchRunOrder(division), 15_000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [pin, division, fetchRunOrder]);

  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pinInput.trim()) {
      setPinError('Enter the DJ PIN provided by contest admin.');
      return;
    }
    setPinError('');
    try {
      const res = await fetch('/api/dj/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput.trim() }),
      });
      if (res.ok) {
        sessionStorage.setItem(PIN_KEY, pinInput.trim());
        setPin(pinInput.trim());
      } else {
        const json = await res.json().catch(() => ({}));
        setPinError((json as { error?: { message?: string } }).error?.message ?? 'Incorrect PIN.');
      }
    } catch {
      setPinError('Network error — try again.');
    }
  }

  // PIN gate
  if (!pin) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--navy-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.6rem', fontWeight: 700 }}>
              DJ Portal
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.4rem', letterSpacing: '0.1em' }}>
              VSYC-26 · SEPT 19, 2026
            </div>
          </div>
          <form onSubmit={handlePinSubmit} style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '2rem' }}>
            <label style={{ display: 'block', fontSize: '0.65rem', letterSpacing: '0.16em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.5rem' }}>
              ACCESS PIN
            </label>
            <input
              type="password"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              autoFocus
              placeholder="Enter PIN"
              style={{
                width: '100%',
                padding: '0.75rem',
                background: '#0d1428',
                border: '1px solid var(--navy-border)',
                color: '#fff',
                fontSize: '1rem',
                fontFamily: 'monospace',
                letterSpacing: '0.2em',
                marginBottom: '1rem',
                boxSizing: 'border-box',
              }}
            />
            {pinError && <p style={{ color: '#ff6b6b', fontSize: '0.8rem', margin: '0 0 1rem' }}>{pinError}</p>}
            <button
              type="submit"
              style={{
                width: '100%',
                background: 'var(--gold)',
                color: 'var(--navy-deep)',
                border: 'none',
                padding: '0.75rem',
                fontWeight: 800,
                fontSize: '0.85rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              Enter
            </button>
          </form>
        </div>
      </div>
    );
  }

  const performers = data?.performers ?? [];
  const nowPerforming = performers.find((p) => p.status === 'performing');
  const upcoming = performers.filter((p) => p.status === 'upcoming');
  const done = performers.filter((p) => p.status === 'done');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--navy-deep)', padding: '0' }}>
      {/* Header bar */}
      <header style={{ background: 'var(--navy)', borderBottom: '2px solid var(--gold)', padding: '0 1.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            <span style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontWeight: 700, fontSize: '1rem' }}>
              DJ Portal
            </span>
            <nav style={{ display: 'flex', gap: '0.5rem' }}>
              {DIVISIONS.map((div) => (
                <button
                  key={div}
                  onClick={() => { setDivision(div); setData(null); }}
                  style={{
                    background: division === div ? 'var(--gold)' : 'transparent',
                    color: division === div ? 'var(--navy-deep)' : 'var(--text-body)',
                    border: '1px solid',
                    borderColor: division === div ? 'var(--gold)' : 'var(--navy-border)',
                    padding: '0.3rem 0.75rem',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    letterSpacing: '0.05em',
                    cursor: 'pointer',
                  }}
                >
                  {div}
                </button>
              ))}
            </nav>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {lastRefresh && (
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                {loading ? 'Refreshing…' : `Updated ${lastRefresh.toLocaleTimeString()}`}
              </span>
            )}
            <button
              onClick={() => { sessionStorage.removeItem(PIN_KEY); setPin(''); }}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.7rem', cursor: 'pointer', letterSpacing: '0.05em' }}
            >
              LOCK
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' }}>
        {/* NOW PLAYING */}
        <section style={{ marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '0.6rem', letterSpacing: '0.18em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.75rem' }}>
            NOW PLAYING
          </div>
          {nowPerforming ? (
            <div style={{ background: '#1a1400', border: '2px solid var(--gold)', padding: '1.5rem 2rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '2rem', fontWeight: 700, lineHeight: 1.1 }}>
                    {nowPerforming.display_name}
                  </div>
                  {(nowPerforming.city || nowPerforming.state) && (
                    <div style={{ color: 'var(--text-muted)', marginTop: '0.25rem', fontSize: '0.9rem' }}>
                      {[nowPerforming.city, nowPerforming.state].filter(Boolean).join(', ')}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '0.6rem', letterSpacing: '0.14em', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                    MUSIC FILE
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: nowPerforming.music_filename ? '#fff' : '#ff6b6b' }}>
                    {nowPerforming.music_filename ?? '⚠ No file uploaded'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '1.5rem 2rem', color: 'var(--text-muted)' }}>
              {performers.length === 0 ? 'Run order not set yet.' : 'Division has not started — advance from admin panel.'}
            </div>
          )}
        </section>

        {/* UP NEXT */}
        {upcoming.length > 0 && (
          <section style={{ marginBottom: '2.5rem' }}>
            <div style={{ fontSize: '0.6rem', letterSpacing: '0.18em', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              UP NEXT
            </div>
            <div style={{ border: '1px solid var(--navy-border)' }}>
              {upcoming.slice(0, 5).map((p, i) => (
                <div
                  key={p.registration_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    borderBottom: i < Math.min(upcoming.length, 5) - 1 ? '1px solid var(--navy-border)' : 'none',
                    background: i === 0 ? '#0d1428' : 'var(--navy)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{
                      width: '1.5rem', height: '1.5rem',
                      background: i === 0 ? 'var(--red)' : 'transparent',
                      border: i === 0 ? 'none' : '1px solid var(--navy-border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.65rem', fontWeight: 800,
                      color: i === 0 ? '#fff' : 'var(--text-muted)',
                      flexShrink: 0,
                    }}>
                      {p.position}
                    </span>
                    <div>
                      <div style={{ fontWeight: 700, color: i === 0 ? '#fff' : 'var(--text-body)', fontSize: '0.95rem' }}>
                        {p.display_name}
                      </div>
                      {(p.city || p.state) && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {[p.city, p.state].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: p.music_filename ? 'var(--text-muted)' : '#ff6b6b', textAlign: 'right', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.music_filename ?? '⚠ missing'}
                  </div>
                </div>
              ))}
              {upcoming.length > 5 && (
                <div style={{ padding: '0.5rem 1rem', color: 'var(--text-muted)', fontSize: '0.75rem', background: 'var(--navy)' }}>
                  +{upcoming.length - 5} more
                </div>
              )}
            </div>
          </section>
        )}

        {/* FULL ORDER */}
        {performers.length > 0 && (
          <section>
            <div style={{ fontSize: '0.6rem', letterSpacing: '0.18em', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              FULL RUN ORDER — {division}
              {data?.source === 'registration_order' && (
                <span style={{ marginLeft: '0.5rem', color: '#ff6b6b' }}>
                  (registration order — run order not set)
                </span>
              )}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'var(--navy)', borderBottom: '2px solid var(--navy-border)' }}>
                  {['#', 'Competitor', 'Location', 'Music File', 'Status'].map((h) => (
                    <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.6rem', letterSpacing: '0.1em', fontWeight: 800, color: 'var(--text-muted)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {performers.map((p) => (
                  <tr
                    key={p.registration_id}
                    style={{ background: statusBg(p.status), borderBottom: '1px solid var(--navy-border)', opacity: p.status === 'done' ? 0.5 : 1 }}
                  >
                    <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>{p.position}</td>
                    <td style={{ padding: '0.6rem 0.75rem', fontWeight: 700, color: statusColor(p.status) }}>{p.display_name}</td>
                    <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {[p.city, p.state].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'monospace', fontSize: '0.75rem', color: p.music_filename ? 'var(--text-body)' : '#ff6b6b' }}>
                      {p.music_filename ?? '⚠ missing'}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <span style={{
                        fontSize: '0.6rem',
                        fontWeight: 800,
                        letterSpacing: '0.1em',
                        color: statusColor(p.status),
                        textTransform: 'uppercase',
                      }}>
                        {p.status === 'performing' ? '▶ NOW' : p.status === 'done' ? '✓ done' : '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </div>
  );
}
