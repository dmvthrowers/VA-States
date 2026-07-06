'use client';

import { useState, useEffect, useCallback } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';
import RunOrderManager from '@/components/RunOrderManager';

const DIVISIONS = ['1A', 'X', 'SBJ'] as const;
type Division = typeof DIVISIONS[number];

interface Performer {
  position: number;
  status: 'upcoming' | 'performing' | 'done';
  registration_id: string;
  display_name: string;
  city: string | null;
  state: string | null;
}

interface ScoreEntry {
  id: string;
  registration_id: string;
  display_name: string;
  city: string | null;
  state: string | null;
  tech_execution: number;
  trick_presentation: number;
  performance_quality: number;
  musicality: number;
  routine_construction: number;
  deduction_stop: number;
  deduction_discard: number;
  deduction_cut: number;
  final_score: number;
  notes: string | null;
}

interface StaffMe {
  auth_user_id: string;
  email: string;
  role: 'judge' | 'dj' | 'audio_tech' | 'admin';
  display_name: string;
  is_active: boolean;
}

const supabase = createBrowserClient();

function ScoreInput({
  label,
  max,
  value,
  onChange,
  disabled,
  accent,
}: {
  label: string;
  max: number;
  value: number | '';
  onChange: (v: number) => void;
  disabled?: boolean;
  accent?: string;
}) {
  return (
    <div style={{ flex: 1, minWidth: 90 }}>
      <label style={{ display: 'block', fontSize: '0.6rem', letterSpacing: '0.1em', fontWeight: 800, color: accent ?? 'var(--gold)', marginBottom: '0.3rem' }}>
        {label} <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>/{max}</span>
      </label>
      <input
        type="number"
        min={0}
        max={max}
        step={0.1}
        value={value}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (!isNaN(n) && n >= 0 && n <= max) onChange(n);
          else if (e.target.value === '') onChange(0);
        }}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '0.5rem',
          background: '#0d1428',
          border: '1px solid var(--navy-border)',
          color: '#fff',
          fontSize: '1rem',
          fontFamily: 'monospace',
          textAlign: 'center',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

export default function JudgePage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [staff, setStaff] = useState<StaffMe | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const [division, setDivision] = useState<Division>('1A');
  const [runOrder, setRunOrder] = useState<Performer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [techExecution, setTechExecution] = useState<number | ''>(0);
  const [trickPresentation, setTrickPresentation] = useState<number | ''>(0);
  const [performanceQuality, setPerformanceQuality] = useState<number | ''>(0);
  const [musicality, setMusicality] = useState<number | ''>(0);
  const [routineConstruction, setRoutineConstruction] = useState<number | ''>(0);
  const [deductionStop, setDeductionStop] = useState<number | ''>(0);
  const [deductionDiscard, setDeductionDiscard] = useState<number | ''>(0);
  const [deductionCut, setDeductionCut] = useState<number | ''>(0);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [myScores, setMyScores] = useState<ScoreEntry[]>([]);
  const [view, setView] = useState<'score' | 'manage'>('score');

  const fetchStaffMe = useCallback(async (accessToken: string): Promise<StaffMe | null> => {
    const res = await fetch('/api/staff/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return await res.json() as StaffMe;
  }, []);

  const fetchRunOrder = useCallback(async (div: Division) => {
    try {
      const res = await fetch(`/api/run-order?division=${div}`);
      if (res.ok) {
        const json = await res.json() as { performers?: Performer[] };
        setRunOrder(json.performers ?? []);
      }
    } catch {
      // Keep existing UI state on transient failures.
    }
  }, []);

  const fetchMyScores = useCallback(async (div: Division, accessToken: string) => {
    try {
      const res = await fetch(`/api/scores?division=${div}&mine=1`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const json = await res.json() as { scores?: ScoreEntry[] };
        setMyScores(json.scores ?? []);
      }
    } catch {
      // Keep existing UI state on transient failures.
    }
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token ?? null;
      if (!active) return;
      setToken(accessToken);
      if (!accessToken) return;

      const me = await fetchStaffMe(accessToken);
      if (!me || !me.is_active || me.role !== 'judge') {
        setAuthError('This account is not authorized for judge access.');
        await supabase.auth.signOut();
        setToken(null);
        setStaff(null);
        return;
      }
      setStaff(me);
      setEmail(me.email);
    })();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const accessToken = session?.access_token ?? null;
      setToken(accessToken);
      if (!accessToken) {
        setStaff(null);
        return;
      }

      const me = await fetchStaffMe(accessToken);
      if (!me || !me.is_active || me.role !== 'judge') {
        setAuthError('This account is not authorized for judge access.');
        await supabase.auth.signOut();
        setToken(null);
        setStaff(null);
        return;
      }
      setStaff(me);
      setEmail(me.email);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [fetchStaffMe]);

  useEffect(() => {
    if (!staff || !token) return;
    fetchRunOrder(division);
    fetchMyScores(division, token);
    const interval = setInterval(() => {
      fetchRunOrder(division);
      fetchMyScores(division, token);
    }, 20000);
    return () => clearInterval(interval);
  }, [staff, token, division, fetchRunOrder, fetchMyScores]);

  useEffect(() => {
    const performing = runOrder.find((p) => p.status === 'performing');
    if (performing) setSelectedId(performing.registration_id);
  }, [runOrder]);

  useEffect(() => {
    if (!selectedId) return;
    const existing = myScores.find((s) => s.registration_id === selectedId);
    if (existing) {
      setTechExecution(existing.tech_execution);
      setTrickPresentation(existing.trick_presentation);
      setPerformanceQuality(existing.performance_quality);
      setMusicality(existing.musicality);
      setRoutineConstruction(existing.routine_construction);
      setDeductionStop(existing.deduction_stop);
      setDeductionDiscard(existing.deduction_discard);
      setDeductionCut(existing.deduction_cut);
      setNotes(existing.notes ?? '');
    } else {
      setTechExecution(0);
      setTrickPresentation(0);
      setPerformanceQuality(0);
      setMusicality(0);
      setRoutineConstruction(0);
      setDeductionStop(0);
      setDeductionDiscard(0);
      setDeductionCut(0);
      setNotes('');
    }
    setSubmitMsg(null);
  }, [selectedId, myScores]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error || !data.session?.access_token) {
      setAuthError(error?.message ?? 'Invalid credentials.');
      return;
    }

    const me = await fetchStaffMe(data.session.access_token);
    if (!me || !me.is_active || me.role !== 'judge') {
      setAuthError('This account is not authorized for judge access.');
      await supabase.auth.signOut();
      return;
    }

    setStaff(me);
    setToken(data.session.access_token);
    setPassword('');
  }

  async function handleSubmitScore(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !selectedId) return;
    if (techExecution === '' || trickPresentation === '' || performanceQuality === '' || musicality === '' || routineConstruction === '') {
      setSubmitMsg({ ok: false, text: 'Tech Execution, Trick Presentation, Performance Quality, Musicality, and Routine Construction are required.' });
      return;
    }

    setSubmitting(true);
    setSubmitMsg(null);

    try {
      const res = await fetch('/api/scores', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          registration_id: selectedId,
          division,
          tech_execution: Number(techExecution),
          trick_presentation: Number(trickPresentation),
          performance_quality: Number(performanceQuality),
          musicality: Number(musicality),
          routine_construction: Number(routineConstruction),
          deduction_stop: Number(deductionStop) || 0,
          deduction_discard: Number(deductionDiscard) || 0,
          deduction_cut: Number(deductionCut) || 0,
          notes: notes.trim() || undefined,
        }),
      });

      const json = await res.json() as { final_score?: number; error?: { message?: string } };
      if (res.ok) {
        setSubmitMsg({ ok: true, text: `Saved - final score ${(json.final_score ?? 0).toFixed(1)}` });
        await fetchMyScores(division, token);
      } else {
        setSubmitMsg({ ok: false, text: json.error?.message ?? 'Error saving score.' });
      }
    } catch {
      setSubmitMsg({ ok: false, text: 'Network error - try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  if (!staff || !token) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--navy-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.6rem', fontWeight: 700 }}>
              Judge Portal
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.4rem', letterSpacing: '0.1em' }}>
              VSYC-26 - Staff Login
            </div>
          </div>

          <form onSubmit={handleLogin} style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.6rem', letterSpacing: '0.16em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.4rem' }}>
                STAFF EMAIL
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                style={{ width: '100%', padding: '0.7rem', background: '#0d1428', border: '1px solid var(--navy-border)', color: '#fff', fontSize: '0.95rem', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.6rem', letterSpacing: '0.16em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.4rem' }}>
                PASSWORD
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: '100%', padding: '0.7rem', background: '#0d1428', border: '1px solid var(--navy-border)', color: '#fff', fontSize: '1rem', boxSizing: 'border-box' }}
              />
            </div>
            {authError && <p style={{ color: '#ff6b6b', fontSize: '0.8rem', margin: 0 }}>{authError}</p>}
            <button
              type="submit"
              style={{ background: 'var(--gold)', color: 'var(--navy-deep)', border: 'none', padding: '0.75rem', fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
            >
              Sign In
            </button>
          </form>
        </div>
      </div>
    );
  }

  const selectedPerformer = runOrder.find((p) => p.registration_id === selectedId);
  const alreadyScored = myScores.find((s) => s.registration_id === selectedId);
  const subtotal = (Number(techExecution) || 0) + (Number(trickPresentation) || 0) + (Number(performanceQuality) || 0) + (Number(musicality) || 0) + (Number(routineConstruction) || 0);
  const totalDeductions = (Number(deductionStop) || 0) + (Number(deductionDiscard) || 0) + (Number(deductionCut) || 0);
  const finalScore = Math.max(0, subtotal - totalDeductions);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--navy-deep)' }}>
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
                  onClick={() => {
                    setDivision(div);
                    setSelectedId(null);
                    setRunOrder([]);
                    setMyScores([]);
                  }}
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
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                onClick={() => setView('score')}
                style={{
                  background: view === 'score' ? 'var(--gold)' : 'transparent',
                  color: view === 'score' ? 'var(--navy-deep)' : 'var(--text-body)',
                  border: '1px solid', borderColor: view === 'score' ? 'var(--gold)' : 'var(--navy-border)',
                  padding: '0.3rem 0.75rem', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.05em', cursor: 'pointer',
                }}
              >
                Score
              </button>
              <button
                onClick={() => setView('manage')}
                style={{
                  background: view === 'manage' ? 'var(--gold)' : 'transparent',
                  color: view === 'manage' ? 'var(--navy-deep)' : 'var(--text-body)',
                  border: '1px solid', borderColor: view === 'manage' ? 'var(--gold)' : 'var(--navy-border)',
                  padding: '0.3rem 0.75rem', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.05em', cursor: 'pointer',
                }}
              >
                Manage Order
              </button>
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{staff.display_name}</span>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                setToken(null);
                setStaff(null);
              }}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.7rem', cursor: 'pointer', letterSpacing: '0.05em' }}
            >
              LOGOUT
            </button>
          </div>
        </div>
      </header>

      {view === 'manage' ? (
        <main style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' }}>
          <section style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '1rem' }}>
            <RunOrderManager token={token} />
          </section>
        </main>
      ) : (
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem', display: 'grid', gridTemplateColumns: '1fr 320px', gap: '2rem', alignItems: 'start' }}>
        <div>
          <section style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.6rem', letterSpacing: '0.16em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.5rem' }}>
              CURRENT DIVISION ORDER
            </div>
            <div style={{ border: '1px solid var(--navy-border)' }}>
              {runOrder.length === 0 ? (
                <div style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', background: 'var(--navy)' }}>
                  No run order yet.
                </div>
              ) : (
                runOrder.map((p) => (
                  <button
                    key={p.registration_id}
                    type="button"
                    onClick={() => setSelectedId(p.registration_id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: selectedId === p.registration_id ? '#1a1400' : p.status === 'performing' ? '#0f1d39' : 'var(--navy)',
                      border: 'none',
                      borderBottom: '1px solid var(--navy-border)',
                      padding: '0.65rem 0.9rem',
                      color: '#fff',
                      cursor: 'pointer',
                      display: 'grid',
                      gridTemplateColumns: '2.2rem 1fr auto',
                      alignItems: 'center',
                      gap: '0.6rem',
                    }}
                  >
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700 }}>{p.position}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>
                      {p.display_name}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: p.status === 'performing' ? 'var(--gold)' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {p.status}
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>

          <section style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '1rem' }}>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.6rem', letterSpacing: '0.16em', fontWeight: 800, color: 'var(--gold)' }}>
                SCORE ENTRY
              </div>
              <div style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 700, marginTop: '0.25rem' }}>
                {selectedPerformer ? selectedPerformer.display_name : 'Select a competitor'}
              </div>
              {selectedPerformer && (selectedPerformer.city || selectedPerformer.state) && (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{[selectedPerformer.city, selectedPerformer.state].filter(Boolean).join(', ')}</div>
              )}
            </div>

            <form onSubmit={handleSubmitScore}>
              <div style={{ marginBottom: '0.4rem' }}>
                <ScoreInput label="TECH EXECUTION" max={60} value={techExecution} onChange={setTechExecution} disabled={!selectedId || submitting} />
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1rem' }}>
                <ScoreInput label="TRICK PRES." max={10} value={trickPresentation} onChange={setTrickPresentation} disabled={!selectedId || submitting} />
                <ScoreInput label="PERF. QUALITY" max={10} value={performanceQuality} onChange={setPerformanceQuality} disabled={!selectedId || submitting} />
                <ScoreInput label="MUSICALITY" max={10} value={musicality} onChange={setMusicality} disabled={!selectedId || submitting} />
                <ScoreInput label="ROUTINE CONSTR." max={10} value={routineConstruction} onChange={setRoutineConstruction} disabled={!selectedId || submitting} />
              </div>

              <div style={{ fontSize: '0.6rem', letterSpacing: '0.14em', fontWeight: 800, color: '#ff6b6b', marginBottom: '0.4rem' }}>
                MAJOR DEDUCTIONS
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1rem' }}>
                <ScoreInput label="STOP" max={60} value={deductionStop} onChange={setDeductionStop} disabled={!selectedId || submitting} accent="#ff6b6b" />
                <ScoreInput label="DISCARD" max={60} value={deductionDiscard} onChange={setDeductionDiscard} disabled={!selectedId || submitting} accent="#ff6b6b" />
                <ScoreInput label="CUT" max={60} value={deductionCut} onChange={setDeductionCut} disabled={!selectedId || submitting} accent="#ff6b6b" />
              </div>

              <div style={{ marginBottom: '0.8rem' }}>
                <label style={{ display: 'block', fontSize: '0.6rem', letterSpacing: '0.14em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.3rem' }}>
                  NOTES (OPTIONAL)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={500}
                  disabled={!selectedId || submitting}
                  rows={3}
                  style={{ width: '100%', background: '#0d1428', border: '1px solid var(--navy-border)', color: '#fff', padding: '0.6rem', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  Subtotal: <span style={{ color: '#fff', fontFamily: 'monospace', fontWeight: 700 }}>{subtotal.toFixed(1)}</span>
                  {totalDeductions > 0 && (
                    <span style={{ color: '#ff6b6b', fontFamily: 'monospace' }}> − {totalDeductions.toFixed(1)}</span>
                  )}
                  {' = '}
                  Final: <span style={{ color: 'var(--gold)', fontFamily: 'monospace', fontWeight: 800 }}>{finalScore.toFixed(1)}</span>
                </div>
                {alreadyScored && <div style={{ color: '#7fff7f', fontSize: '0.75rem' }}>Existing score will be updated</div>}
              </div>

              {submitMsg && (
                <p style={{ color: submitMsg.ok ? '#7fff7f' : '#ff6b6b', fontSize: '0.8rem', margin: '0 0 0.8rem' }}>{submitMsg.text}</p>
              )}

              <button
                type="submit"
                disabled={!selectedId || submitting}
                style={{
                  width: '100%',
                  background: !selectedId || submitting ? 'var(--navy-border)' : 'var(--red)',
                  color: '#fff',
                  border: 'none',
                  padding: '0.75rem 1rem',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  cursor: !selectedId || submitting ? 'not-allowed' : 'pointer',
                  textTransform: 'uppercase',
                  fontSize: '0.8rem',
                }}
              >
                {submitting ? 'Saving...' : 'Save score'}
              </button>
            </form>
          </section>
        </div>

        <aside>
          <section style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '1rem' }}>
            <div style={{ fontSize: '0.6rem', letterSpacing: '0.16em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.75rem' }}>
              MY SCORES ({division})
            </div>
            {myScores.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>No scores submitted yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {myScores.map((s) => (
                  <div key={s.id} style={{ border: '1px solid var(--navy-border)', padding: '0.55rem 0.6rem', background: '#0f1a33' }}>
                    <div style={{ color: '#fff', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.display_name}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: '0.2rem' }}>
                      TE {s.tech_execution.toFixed(1)} | TP {s.trick_presentation.toFixed(1)} | PQ {s.performance_quality.toFixed(1)} | MU {s.musicality.toFixed(1)} | RC {s.routine_construction.toFixed(1)}
                      {(s.deduction_stop + s.deduction_discard + s.deduction_cut) > 0 && (
                        <span style={{ color: '#ff6b6b' }}> | −{(s.deduction_stop + s.deduction_discard + s.deduction_cut).toFixed(1)}</span>
                      )}
                    </div>
                    <div style={{ color: 'var(--gold)', fontFamily: 'monospace', fontWeight: 800, fontSize: '0.92rem' }}>
                      {s.final_score.toFixed(1)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </main>
      )}
    </div>
  );
}
