'use client';

import { useState, useEffect, useCallback } from 'react';

const DIVISIONS = ['1A', 'X', 'SBJ'] as const;
type Division = typeof DIVISIONS[number];

const AUTH_KEY = 'vsyc26_judge_auth';

interface Performer {
  position: number;
  status: 'upcoming' | 'performing' | 'done';
  registration_id: string;
  display_name: string;
  city: string | null;
  state: string | null;
}

interface ScoreEntry {
  registration_id: string;
  display_name: string;
  city: string | null;
  state: string | null;
  execution: number;
  difficulty: number;
  presentation: number;
  total: number;
  notes: string | null;
}

interface AuthState {
  judge_name: string;
  pin: string;
}

function ScoreInput({
  label, value, onChange, disabled,
}: {
  label: string;
  value: number | '';
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ flex: 1 }}>
      <label style={{ display: 'block', fontSize: '0.6rem', letterSpacing: '0.14em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.3rem' }}>
        {label}
      </label>
      <input
        type="number"
        min={0}
        max={100}
        step={0.5}
        value={value}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (!isNaN(n) && n >= 0 && n <= 100) onChange(n);
        }}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '0.6rem',
          background: '#0d1428',
          border: '1px solid var(--navy-border)',
          color: '#fff',
          fontSize: '1.1rem',
          fontFamily: 'monospace',
          textAlign: 'center',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

export default function JudgePage() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [judgeInput, setJudgeInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [authError, setAuthError] = useState('');

  const [division, setDivision] = useState<Division>('1A');
  const [runOrder, setRunOrder] = useState<Performer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [execution, setExecution] = useState<number | ''>(0);
  const [difficulty, setDifficulty] = useState<number | ''>(0);
  const [presentation, setPresentation] = useState<number | ''>(0);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [myScores, setMyScores] = useState<ScoreEntry[]>([]);

  // Restore auth from sessionStorage
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(AUTH_KEY);
      if (stored) setAuth(JSON.parse(stored));
    } catch {}
  }, []);

  const fetchRunOrder = useCallback(async (div: Division) => {
    try {
      const res = await fetch(`/api/run-order?division=${div}`);
      if (res.ok) {
        const json = await res.json();
        setRunOrder(json.performers ?? []);
      }
    } catch {}
  }, []);

  const fetchMyScores = useCallback(async (div: Division, a: AuthState) => {
    try {
      const res = await fetch(`/api/scores?division=${div}&judge=${encodeURIComponent(a.judge_name)}&pin=${encodeURIComponent(a.pin)}`);
      if (res.ok) {
        const json = await res.json();
        setMyScores(json.scores ?? []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!auth) return;
    fetchRunOrder(division);
    fetchMyScores(division, auth);
    const interval = setInterval(() => {
      fetchRunOrder(division);
      fetchMyScores(division, auth);
    }, 20_000);
    return () => clearInterval(interval);
  }, [auth, division, fetchRunOrder, fetchMyScores]);

  // Auto-select the currently performing competitor
  useEffect(() => {
    const performing = runOrder.find((p) => p.status === 'performing');
    if (performing) setSelectedId(performing.registration_id);
  }, [runOrder]);

  // Pre-fill scores if already scored this competitor
  useEffect(() => {
    if (!selectedId) return;
    const existing = myScores.find((s) => s.registration_id === selectedId);
    if (existing) {
      setExecution(existing.execution);
      setDifficulty(existing.difficulty);
      setPresentation(existing.presentation);
      setNotes(existing.notes ?? '');
    } else {
      setExecution(0);
      setDifficulty(0);
      setPresentation(0);
      setNotes('');
    }
    setSubmitMsg(null);
  }, [selectedId, myScores]);

  function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (judgeInput.trim().length < 2) {
      setAuthError('Enter your full name.');
      return;
    }
    if (pinInput.trim().length < 3) {
      setAuthError('Enter the judge PIN.');
      return;
    }
    const a: AuthState = { judge_name: judgeInput.trim(), pin: pinInput.trim() };
    sessionStorage.setItem(AUTH_KEY, JSON.stringify(a));
    setAuth(a);
    setAuthError('');
  }

  async function handleSubmitScore(e: React.FormEvent) {
    e.preventDefault();
    if (!auth || !selectedId) return;
    if (execution === '' || difficulty === '' || presentation === '') {
      setSubmitMsg({ ok: false, text: 'All three scores are required.' });
      return;
    }

    setSubmitting(true);
    setSubmitMsg(null);

    try {
      const res = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: auth.pin,
          judge_name: auth.judge_name,
          registration_id: selectedId,
          division,
          execution: Number(execution),
          difficulty: Number(difficulty),
          presentation: Number(presentation),
          notes: notes.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        setSubmitMsg({ ok: true, text: `Saved — total ${json.total.toFixed(1)}` });
        fetchMyScores(division, auth);
      } else {
        setSubmitMsg({ ok: false, text: json.error?.message ?? 'Error saving score.' });
      }
    } catch {
      setSubmitMsg({ ok: false, text: 'Network error — try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  // Auth gate
  if (!auth) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--navy-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.6rem', fontWeight: 700 }}>
              Judge Portal
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.4rem', letterSpacing: '0.1em' }}>
              VSYC-26 · SEPT 19, 2026
            </div>
          </div>
          <form onSubmit={handleAuthSubmit} style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.6rem', letterSpacing: '0.16em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.4rem' }}>
                YOUR NAME
              </label>
              <input
                type="text"
                value={judgeInput}
                onChange={(e) => setJudgeInput(e.target.value)}
                autoFocus
                placeholder="First Last"
                style={{ width: '100%', padding: '0.7rem', background: '#0d1428', border: '1px solid var(--navy-border)', color: '#fff', fontSize: '0.95rem', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.6rem', letterSpacing: '0.16em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.4rem' }}>
                JUDGE PIN
              </label>
              <input
                type="password"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="Enter PIN"
                style={{ width: '100%', padding: '0.7rem', background: '#0d1428', border: '1px solid var(--navy-border)', color: '#fff', fontSize: '1rem', fontFamily: 'monospace', letterSpacing: '0.2em', boxSizing: 'border-box' }}
              />
            </div>
            {authError && <p style={{ color: '#ff6b6b', fontSize: '0.8rem', margin: 0 }}>{authError}</p>}
            <button
              type="submit"
              style={{ background: 'var(--gold)', color: 'var(--navy-deep)', border: 'none', padding: '0.75rem', fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
            >
              Enter Portal
            </button>
          </form>
        </div>
      </div>
    );
  }

  const selectedPerformer = runOrder.find((p) => p.registration_id === selectedId);
  const alreadyScored = myScores.find((s) => s.registration_id === selectedId);
  const total = (Number(execution) || 0) + (Number(difficulty) || 0) + (Number(presentation) || 0);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--navy-deep)' }}>
      {/* Header */}
      <header style={{ background: 'var(--navy)', borderBottom: '2px solid var(--red)', padding: '0 1.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            <span style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontWeight: 700, fontSize: '1rem' }}>
              Judge Portal
            </span>
            <nav style={{ display: 'flex', gap: '0.5rem' }}>
              {DIVISIONS.map((div) => (
                <button
                  key={div}
                  onClick={() => { setDivision(div); setSelectedId(null); setRunOrder([]); setMyScores([]); }}
                  style={{
                    background: division === div ? 'var(--red)' : 'transparent',
                    color: '#fff',
                    border: '1px solid',
                    borderColor: division === div ? 'var(--red)' : 'var(--navy-border)',
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
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {auth.judge_name}
            </span>
            <button
              onClick={() => { sessionStorage.removeItem(AUTH_KEY); setAuth(null); }}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.7rem', cursor: 'pointer', letterSpacing: '0.05em' }}
            >
              LOGOUT
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem', display: 'grid', gridTemplateColumns: '1fr 320px', gap: '2rem', alignItems: 'start' }}>
        {/* Left: score form */}
        <div>
          {/* Competitor selector */}
          <section style={{ marginBottom: '2rem' }}>
            <div style={{ fontSize: '0.6rem', letterSpacing: '0.18em', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              SELECT COMPETITOR — {division}
            </div>
            <div style={{ border: '1px solid var(--navy-border)', maxHeight: 280, overflowY: 'auto' }}>
              {runOrder.length === 0 ? (
                <div style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Run order not set. Showing all paid registrants…
                </div>
              ) : (
                runOrder.map((p) => {
                  const scored = myScores.find((s) => s.registration_id === p.registration_id);
                  const isSelected = p.registration_id === selectedId;
                  const isNow = p.status === 'performing';
                  return (
                    <button
                      key={p.registration_id}
                      onClick={() => setSelectedId(p.registration_id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        padding: '0.65rem 1rem',
                        background: isSelected ? '#1a1400' : isNow ? '#0d1428' : 'var(--navy)',
                        border: 'none',
                        borderBottom: '1px solid var(--navy-border)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        color: '#fff',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', width: '1.2rem', textAlign: 'right', flexShrink: 0 }}>
                          {p.position}
                        </span>
                        <span style={{ fontWeight: isNow || isSelected ? 700 : 400, color: isNow ? 'var(--gold)' : '#fff', fontSize: '0.9rem' }}>
                          {p.display_name}
                          {isNow && <span style={{ marginLeft: '0.4rem', fontSize: '0.6rem', color: 'var(--gold)' }}>▶ NOW</span>}
                        </span>
                      </div>
                      {scored && (
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#7fff7f' }}>
                          ✓ {scored.total.toFixed(1)}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {/* Score form */}
          {selectedId && (
            <section>
              <div style={{ fontSize: '0.6rem', letterSpacing: '0.18em', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                SCORING — {selectedPerformer?.display_name ?? selectedId.slice(0, 8)}
                {alreadyScored && <span style={{ marginLeft: '0.5rem', color: '#7fff7f' }}>· previously scored</span>}
              </div>
              <form onSubmit={handleSubmitScore} style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <ScoreInput label="EXECUTION" value={execution} onChange={setExecution} />
                  <ScoreInput label="DIFFICULTY" value={difficulty} onChange={setDifficulty} />
                  <ScoreInput label="PRESENTATION" value={presentation} onChange={setPresentation} />
                </div>

                <div style={{ background: '#0d1428', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.65rem', letterSpacing: '0.12em', fontWeight: 800, color: 'var(--text-muted)' }}>TOTAL</span>
                  <span style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '2rem', fontWeight: 700 }}>
                    {total.toFixed(1)}
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.6rem', letterSpacing: '0.14em', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                    NOTES (optional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    maxLength={500}
                    rows={2}
                    placeholder="Optional judge notes…"
                    style={{ width: '100%', padding: '0.6rem', background: '#0d1428', border: '1px solid var(--navy-border)', color: '#fff', fontSize: '0.85rem', resize: 'vertical', boxSizing: 'border-box' }}
                  />
                </div>

                {submitMsg && (
                  <p style={{ color: submitMsg.ok ? '#7fff7f' : '#ff6b6b', fontSize: '0.85rem', margin: 0, fontWeight: 700 }}>
                    {submitMsg.text}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    background: submitting ? 'var(--navy-border)' : 'var(--gold)',
                    color: submitting ? 'var(--text-muted)' : 'var(--navy-deep)',
                    border: 'none',
                    padding: '0.8rem',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submitting ? 'Saving…' : alreadyScored ? 'Update Score' : 'Submit Score'}
                </button>
              </form>
            </section>
          )}
        </div>

        {/* Right: my scores sidebar */}
        <aside>
          <div style={{ fontSize: '0.6rem', letterSpacing: '0.18em', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
            MY SCORES — {division}
          </div>
          {myScores.length === 0 ? (
            <div style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              No scores submitted yet.
            </div>
          ) : (
            <div style={{ border: '1px solid var(--navy-border)' }}>
              {[...myScores]
                .sort((a, b) => b.total - a.total)
                .map((s, i) => (
                  <div
                    key={s.registration_id}
                    style={{
                      padding: '0.65rem 0.75rem',
                      borderBottom: i < myScores.length - 1 ? '1px solid var(--navy-border)' : 'none',
                      background: 'var(--navy)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>{s.display_name}</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--gold)' }}>{s.total.toFixed(1)}</span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      E:{s.execution} · D:{s.difficulty} · P:{s.presentation}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
