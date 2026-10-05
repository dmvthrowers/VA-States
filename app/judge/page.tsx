'use client';

import { useState, useEffect, useCallback, useId } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase/client';
import RunOrderManager from '@/components/RunOrderManager';
import LadderSheet from '@/components/LadderSheet';
import { contest, competition, divisionByCode } from '@/contest.config';
import {
  betterOf, effectiveStyle, formatSummary, freestyleBreakdown, manualBest, manualBreakdown, panelMax, panelTotal, roundsOf, styleMultiplier,
} from '@/lib/divisions-core';

/**
 * Score sheet per division comes from contest.config.ts → competition.divisions (docs/FORMATS.md):
 *  - "freestyle": NYYL-style sheet (clicker tally normalized per judge + four evaluation
 *    categories − optional deductions)
 *  - "panel": one 0–max score per criterion; the total is their sum
 *  - "manual": one number (or best of N attempts), higher or lower wins
 *  - "ladder": the LadderSheet (components/LadderSheet.tsx, /api/ladder)
 *  - "bracket": judged on /judge/battles
 *  - "showcase": not judged; the run order only
 * Divisions with rounds (roundsOf) get round tabs; scores and the run order are per round.
 */
type Division = string;
const DIVISIONS = competition.divisions;

interface Performer {
  position: number;
  status: 'upcoming' | 'performing' | 'done';
  registration_id: string;
  display_name: string;
  city: string | null;
  state: string | null;
  /** This competitor's style(s) in this division, e.g. "2A, 3A". Null when the division has no styles. */
  style: string | null;
}

interface ScoreEntry {
  id: string;
  registration_id: string;
  display_name: string;
  city: string | null;
  state: string | null;
  tech_execution_raw: number;
  tech_execution_normalized: number;
  trick_presentation: number;
  performance_quality: number;
  musicality: number;
  routine_construction: number;
  stop_count: number;
  discard_count: number;
  detach_count: number;
  deduction_points: number;
  final_score: number;
  style_code: string | null;
  registered_styles: string[];
  manual_score: number | null;
  manual_attempts?: (number | null)[] | null;
  panel_scores?: Record<string, number> | null;
  round?: number;
  notes: string | null;
}

const splitStyles = (s: string | null | undefined): string[] =>
  (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);

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
  sublabel,
  min = 0,
  max,
  step = 0.1,
  value,
  onChange,
  disabled,
  accent,
  allowBlank,
  highlight,
}: {
  label: string;
  sublabel?: string;
  min?: number;
  max: number;
  step?: number;
  value: number | '';
  onChange: (v: number | '') => void;
  disabled?: boolean;
  accent?: string;
  /** Empty input stays blank ('') instead of becoming 0 (attempts not taken, unscored criteria). */
  allowBlank?: boolean;
  /** Outline this input (e.g. the best attempt). */
  highlight?: boolean;
}) {
  const id = useId();
  return (
    <div style={{ flex: 1, minWidth: 90 }}>
      <label htmlFor={id} style={{ display: 'block', fontSize: '0.6rem', letterSpacing: '0.1em', fontWeight: 800, color: accent ?? 'var(--gold)', marginBottom: '0.3rem' }}>
        {label} <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{sublabel ?? `/${max}`}</span>
      </label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (!isNaN(n) && n >= min && n <= max) onChange(n);
          else if (e.target.value === '') onChange(allowBlank ? '' : 0);
        }}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '0.5rem',
          background: '#0d1428',
          border: highlight ? '1px solid var(--gold)' : '1px solid var(--navy-border)',
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

  const [division, setDivision] = useState<Division>(DIVISIONS[0]?.code ?? '');
  const [runOrder, setRunOrder] = useState<Performer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [techExecutionRaw, setTechExecutionRaw] = useState<number | ''>(0);
  const [trickPresentation, setTrickPresentation] = useState<number | ''>(0);
  const [performanceQuality, setPerformanceQuality] = useState<number | ''>(0);
  const [musicality, setMusicality] = useState<number | ''>(0);
  const [routineConstruction, setRoutineConstruction] = useState<number | ''>(0);
  const [stopCount, setStopCount] = useState<number | ''>(0);
  const [discardCount, setDiscardCount] = useState<number | ''>(0);
  const [detachCount, setDetachCount] = useState<number | ''>(0);
  const [styleCode, setStyleCode] = useState('');
  const [manualScore, setManualScore] = useState<number | ''>(0);
  const [manualAttempts, setManualAttempts] = useState<(number | '')[]>([]);
  const [panelScores, setPanelScores] = useState<Record<string, number | ''>>({});
  const [round, setRound] = useState(1);
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

  const fetchRunOrder = useCallback(async (div: Division, rnd: number, accessToken: string) => {
    try {
      // Staff token: judges need full legal names to identify performers.
      // Servers that don't know `round` yet ignore it and return round 1.
      const res = await fetch(`/api/run-order?division=${encodeURIComponent(div)}&round=${rnd}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const json = await res.json() as { performers?: Performer[] };
        setRunOrder(json.performers ?? []);
      }
    } catch {
      // Keep existing UI state on transient failures.
    }
  }, []);

  const fetchMyScores = useCallback(async (div: Division, rnd: number, accessToken: string) => {
    try {
      const res = await fetch(`/api/scores?division=${encodeURIComponent(div)}&round=${rnd}&mine=1`, {
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

  // What the selected division needs loaded: ladders and brackets load their own data.
  const format = divisionByCode(division)?.scoring.format;
  const usesRunOrder = format === 'freestyle' || format === 'panel' || format === 'manual' || format === 'showcase';
  const usesScores = format === 'freestyle' || format === 'panel' || format === 'manual';

  useEffect(() => {
    if (!staff || !token) return;
    const load = () => {
      if (usesRunOrder) fetchRunOrder(division, round, token);
      if (usesScores) fetchMyScores(division, round, token);
    };
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [staff, token, division, round, usesRunOrder, usesScores, fetchRunOrder, fetchMyScores]);

  useEffect(() => {
    const performing = runOrder.find((p) => p.status === 'performing');
    if (performing) setSelectedId(performing.registration_id);
  }, [runOrder]);

  useEffect(() => {
    if (!selectedId) return;
    const existing = myScores.find((s) => s.registration_id === selectedId);
    const sc = divisionByCode(division)?.scoring;
    const attemptCount = sc?.format === 'manual' ? sc.attempts ?? 1 : 0;
    const blanks = (): (number | '')[] => Array.from({ length: attemptCount }, () => '');
    if (sc?.format === 'manual' && attemptCount > 1) {
      const saved = existing?.manual_attempts
        ?? (existing?.manual_score !== null && existing?.manual_score !== undefined ? [existing.manual_score] : []);
      setManualAttempts(blanks().map((_, i) => (typeof saved[i] === 'number' ? saved[i] as number : '')));
    } else {
      setManualAttempts([]);
    }
    setPanelScores(sc?.format === 'panel'
      ? Object.fromEntries(sc.criteria.map((c) => [c.key, existing?.panel_scores?.[c.key] ?? '']))
      : {});
    if (existing) {
      setTechExecutionRaw(existing.tech_execution_raw);
      setTrickPresentation(existing.trick_presentation);
      setPerformanceQuality(existing.performance_quality);
      setMusicality(existing.musicality);
      setRoutineConstruction(existing.routine_construction);
      setStopCount(existing.stop_count);
      setDiscardCount(existing.discard_count);
      setDetachCount(existing.detach_count);
      setStyleCode(existing.style_code ?? '');
      setManualScore(existing.manual_score ?? 0);
      setNotes(existing.notes ?? '');
    } else {
      setTechExecutionRaw(0);
      setTrickPresentation(0);
      setPerformanceQuality(0);
      setMusicality(0);
      setRoutineConstruction(0);
      setStopCount(0);
      setDiscardCount(0);
      setDetachCount(0);
      setStyleCode('');
      setManualScore(0);
      setNotes('');
    }
    setSubmitMsg(null);
  }, [selectedId, myScores, division]);

  // ---- derived from the selected division's scoring config
  const divDef = divisionByCode(division);
  const scoring = divDef?.scoring;
  const isManual = scoring?.format === 'manual';
  const freestyle = scoring?.format === 'freestyle' ? scoring : null;
  const panel = scoring?.format === 'panel' ? scoring : null;
  const manual = scoring?.format === 'manual' ? scoring : null;
  const deductions = freestyle?.deductions ?? null;
  const rounds = roundsOf(divDef);
  const manualUnit = manual?.unit ?? 'points';
  const lowerWins = betterOf(scoring) === 'lower';
  const multiAttempt = !!manual && (manual.attempts ?? 1) > 1;
  // Best attempt so far (manual, best of N), and which attempt it was.
  const attemptNumbers = manualAttempts.map((v) => (v === '' ? null : Number(v)));
  const bestAttempt = manual && multiAttempt ? manualBest(attemptNumbers, manual) : null;
  const bestIndex = bestAttempt === null || !manual
    ? -1
    : attemptNumbers.findIndex((v) => v !== null && manualBest([v], manual) === bestAttempt);

  const selectedPerformer = runOrder.find((p) => p.registration_id === selectedId);
  const alreadyScored = myScores.find((s) => s.registration_id === selectedId);
  // The competitor's registered styles: from the run order, else from an existing score.
  const selectedStyles = selectedPerformer?.style !== undefined
    ? splitStyles(selectedPerformer.style)
    : alreadyScored?.registered_styles ?? [];
  const needsStylePick = selectedStyles.length > 1;
  const styleLabel = (code: string) => divDef?.styles?.options.find((o) => o.code === code)?.label ?? code;

  // Live preview, using the same math as the server (lib/divisions-core.ts).
  let preview: { tech: number; evalTotal: number; ded: number; final: number } | null = null;
  let panelPreview: { total: number; max: number } | null = null;
  if (freestyle && divDef) {
    const mult = styleMultiplier(divDef, effectiveStyle(styleCode || null, selectedStyles));
    const sheet = {
      tech_execution_raw: Number(techExecutionRaw) || 0,
      trick_presentation: Number(trickPresentation) || 0,
      performance_quality: Number(performanceQuality) || 0,
      musicality: Number(musicality) || 0,
      routine_construction: Number(routineConstruction) || 0,
      stop_count: deductions ? Number(stopCount) || 0 : 0,
      discard_count: deductions ? Number(discardCount) || 0 : 0,
      detach_count: deductions ? Number(detachCount) || 0 : 0,
    };
    // Normalize against this judge's own highest multiplied tally, counting this entry.
    const others = myScores
      .filter((s) => s.registration_id !== selectedId && s.tech_execution_raw > 0)
      .map((s) => s.tech_execution_raw * styleMultiplier(divDef, effectiveStyle(s.style_code, s.registered_styles)));
    const mine = sheet.tech_execution_raw > 0 ? [sheet.tech_execution_raw * mult] : [];
    const all = [...others, ...mine];
    const b = freestyleBreakdown(sheet, freestyle, mult, all.length > 0 ? Math.max(...all) : null);
    preview = { tech: b.tech_execution_normalized, evalTotal: b.total_eval, ded: b.deduction_points, final: b.final_score };
  } else if (manual) {
    const raw = multiAttempt ? bestAttempt : manualScore === '' ? null : Number(manualScore);
    if (raw !== null) preview = { tech: 0, evalTotal: 0, ded: 0, final: manualBreakdown(raw, manual).final_score };
  } else if (panel) {
    panelPreview = {
      total: panelTotal(Object.fromEntries(Object.entries(panelScores).map(([k, v]) => [k, v === '' ? null : v])), panel),
      max: panelMax(panel),
    };
  }

  const multiplierNote = freestyle && divDef?.styles?.options.some((o) => (o.multiplier ?? 1) !== 1)
    ? `Enter the raw tally only: the style multiplier (${divDef.styles.options
        .map((o) => `${o.code} ×${(o.multiplier ?? 1).toFixed(2)}`)
        .join(', ')}) is applied automatically before normalization.`
    : '';

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
    if (!token || !selectedId || !divDef) return;
    if (needsStylePick && !styleCode) {
      setSubmitMsg({ ok: false, text: `Pick which style this routine was (${selectedStyles.join(' or ')}).` });
      return;
    }
    if (manual && multiAttempt) {
      if (bestAttempt === null) {
        setSubmitMsg({ ok: false, text: 'Enter at least one attempt.' });
        return;
      }
    } else if (isManual) {
      if (manualScore === '') {
        setSubmitMsg({ ok: false, text: 'A score is required.' });
        return;
      }
    } else if (panel) {
      const missing = panel.criteria.filter((c) => panelScores[c.key] === '' || panelScores[c.key] === undefined);
      if (missing.length > 0) {
        setSubmitMsg({ ok: false, text: `Score every criterion: ${missing.map((c) => c.label).join(', ')}.` });
        return;
      }
    } else if (techExecutionRaw === '' || trickPresentation === '' || performanceQuality === '' || musicality === '' || routineConstruction === '') {
      setSubmitMsg({ ok: false, text: 'Tech Execution, Trick Presentation, Performance Quality, Musicality, and Routine Construction are required.' });
      return;
    }

    setSubmitting(true);
    setSubmitMsg(null);

    const sheet = manual && multiAttempt
      ? { manual_attempts: attemptNumbers }
      : isManual
      ? { manual_score: Number(manualScore) }
      : panel
      ? { panel_scores: Object.fromEntries(panel.criteria.map((c) => [c.key, Number(panelScores[c.key]) || 0])) }
      : {
          tech_execution_raw: Number(techExecutionRaw),
          trick_presentation: Number(trickPresentation),
          performance_quality: Number(performanceQuality),
          musicality: Number(musicality),
          routine_construction: Number(routineConstruction),
          stop_count: deductions ? Number(stopCount) || 0 : 0,
          discard_count: deductions ? Number(discardCount) || 0 : 0,
          detach_count: deductions ? Number(detachCount) || 0 : 0,
        };

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
          round,
          ...(needsStylePick ? { style_code: styleCode } : {}),
          ...sheet,
          notes: notes.trim() || undefined,
        }),
      });

      const json = await res.json() as { final_score?: number; error?: { message?: string } };
      if (res.ok) {
        setSubmitMsg({ ok: true, text: `Saved - ${isManual ? `${(json.final_score ?? 0).toFixed(2)} ${manualUnit}` : `final score ${(json.final_score ?? 0).toFixed(1)}`}` });
        await fetchMyScores(division, round, token);
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
              {contest.shortName} - Staff Login
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

  return (
    <div style={{ minHeight: '100vh', background: 'var(--navy-deep)' }}>
      <header style={{ background: 'var(--navy)', borderBottom: '2px solid var(--red)', padding: '0 1.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, flexWrap: 'wrap', gap: '0.5rem 1rem', padding: '0.5rem 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem 2rem', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontWeight: 700, fontSize: '1rem' }}>
              Judge Portal
            </span>
            <nav aria-label="Divisions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {DIVISIONS.map(({ code: div, name }) => (
                <button
                  key={div}
                  type="button"
                  title={name}
                  aria-pressed={division === div}
                  onClick={() => {
                    setDivision(div);
                    setRound(1);
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
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem', display: 'flex', flexWrap: 'wrap', gap: '2rem', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 100%', minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem 1.5rem' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 700 }}>{divDef?.name ?? division}</div>
            {divDef && <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.15rem' }}>{formatSummary(divDef)}</div>}
          </div>
          {rounds.length > 1 && (
            <nav aria-label="Rounds" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {rounds.map((r, i) => (
                <button
                  key={r.name}
                  type="button"
                  aria-pressed={round === i + 1}
                  onClick={() => {
                    if (round === i + 1) return;
                    setRound(i + 1);
                    setSelectedId(null);
                    setRunOrder([]);
                    setMyScores([]);
                  }}
                  style={{
                    background: round === i + 1 ? 'var(--gold)' : 'transparent',
                    color: round === i + 1 ? 'var(--navy-deep)' : 'var(--text-body)',
                    border: '1px solid', borderColor: round === i + 1 ? 'var(--gold)' : 'var(--navy-border)',
                    padding: '0.35rem 0.85rem', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.05em', cursor: 'pointer',
                  }}
                >
                  {r.name}
                </button>
              ))}
            </nav>
          )}
        </div>

        {format === 'ladder' ? (
          <div style={{ flex: '1 1 100%', minWidth: 0 }}>
            <LadderSheet division={division} token={token} />
          </div>
        ) : format === 'bracket' ? (
          <section style={{ flex: '1 1 100%', minWidth: 0, background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '1rem' }}>
            <div style={{ fontSize: '0.6rem', letterSpacing: '0.16em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.4rem' }}>
              BATTLE BRACKET
            </div>
            <p style={{ color: 'var(--text-body)', fontSize: '0.85rem', margin: '0 0 0.9rem' }}>
              Battles are judged match by match: vote for the winner of each battle on the battles screen. An admin confirms each result.
            </p>
            <Link
              href={`/judge/battles?division=${encodeURIComponent(division)}`}
              style={{ display: 'inline-block', background: 'var(--red)', color: '#fff', padding: '0.7rem 1rem', fontWeight: 800, letterSpacing: '0.08em', fontSize: '0.8rem', textTransform: 'uppercase', textDecoration: 'none' }}
            >
              Open the battles screen
            </Link>
          </section>
        ) : (
        <>
        <div style={{ flex: '999 1 420px', minWidth: 0 }}>
          <section style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.6rem', letterSpacing: '0.16em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.5rem' }}>
              {rounds.length > 1 ? `RUN ORDER: ${rounds[round - 1]?.name.toUpperCase() ?? `ROUND ${round}`}` : 'CURRENT DIVISION ORDER'}
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

          {format === 'showcase' ? (
          <section style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '1rem' }}>
            <div style={{ fontSize: '0.6rem', letterSpacing: '0.16em', fontWeight: 800, color: 'var(--gold)' }}>
              SHOWCASE
            </div>
            <p style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 700, margin: '0.25rem 0 0.3rem' }}>Not judged</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
              Showcase acts perform in the run order above. There is nothing to score.
            </p>
          </section>
          ) : (
          <section style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '1rem' }}>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.6rem', letterSpacing: '0.16em', fontWeight: 800, color: 'var(--gold)' }}>
                SCORE ENTRY{rounds.length > 1 ? ` · ${rounds[round - 1]?.name.toUpperCase() ?? `ROUND ${round}`}` : ''}
              </div>
              <div style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 700, marginTop: '0.25rem' }}>
                {selectedPerformer ? selectedPerformer.display_name : 'Select a competitor'}
              </div>
              {selectedPerformer && (selectedPerformer.city || selectedPerformer.state) && (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{[selectedPerformer.city, selectedPerformer.state].filter(Boolean).join(', ')}</div>
              )}
            </div>

            <form onSubmit={handleSubmitScore}>
              {needsStylePick && (
                <fieldset style={{ border: '1px solid var(--navy-border)', padding: '0.6rem 0.75rem', margin: '0 0 1rem' }}>
                  <legend style={{ fontSize: '0.6rem', letterSpacing: '0.14em', fontWeight: 800, color: 'var(--gold)', padding: '0 0.3rem' }}>
                    STYLE PERFORMED (REQUIRED)
                  </legend>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1rem' }}>
                    {selectedStyles.map((code) => (
                      <label key={code} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#fff', fontSize: '0.85rem', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="style_code"
                          value={code}
                          checked={styleCode === code}
                          onChange={() => setStyleCode(code)}
                          disabled={submitting}
                          required
                        />
                        {styleLabel(code)}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              {manual && !multiAttempt && (
                <div style={{ marginBottom: '1rem' }}>
                  <ScoreInput
                    label={manualUnit.toUpperCase()}
                    sublabel={`(0–${manual.max}${lowerWins ? ', lower wins' : ''})`}
                    max={manual.max}
                    step={0.01}
                    value={manualScore}
                    onChange={setManualScore}
                    disabled={!selectedId || submitting}
                  />
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.68rem', margin: '0.3rem 0 0' }}>
                    Type one number in {manualUnit} from 0 to {manual.max}.{lowerWins ? ' Lower wins.' : ''} Judges&rsquo; numbers are averaged.
                  </p>
                </div>
              )}

              {manual && multiAttempt && (
                <fieldset style={{ border: '1px solid var(--navy-border)', padding: '0.6rem 0.75rem', margin: '0 0 1rem' }}>
                  <legend style={{ fontSize: '0.6rem', letterSpacing: '0.14em', fontWeight: 800, color: 'var(--gold)', padding: '0 0.3rem' }}>
                    ATTEMPTS ({manualUnit.toUpperCase()}{lowerWins ? ', LOWER WINS' : ''})
                  </legend>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                    {Array.from({ length: manual.attempts ?? 1 }, (_, i) => manualAttempts[i] ?? '').map((v, i) => (
                      <ScoreInput
                        key={i}
                        label={`ATTEMPT ${i + 1}`}
                        sublabel={bestIndex === i ? `(${manualUnit}) ★ BEST` : `(${manualUnit})`}
                        max={manual.max}
                        step={0.01}
                        value={v}
                        allowBlank
                        highlight={bestIndex === i}
                        onChange={(n) => setManualAttempts((prev) =>
                          Array.from({ length: manual.attempts ?? 1 }, (_, j) => (j === i ? n : prev[j] ?? '')))}
                        disabled={!selectedId || submitting}
                      />
                    ))}
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.68rem', margin: '0.4rem 0 0' }}>
                    Leave an attempt blank if it wasn&rsquo;t taken. The best attempt counts ({lowerWins ? 'the lowest' : 'the highest'}, 0–{manual.max} {manualUnit}).
                  </p>
                </fieldset>
              )}

              {panel && (
                <fieldset style={{ border: '1px solid var(--navy-border)', padding: '0.6rem 0.75rem', margin: '0 0 1rem' }}>
                  <legend style={{ fontSize: '0.6rem', letterSpacing: '0.14em', fontWeight: 800, color: 'var(--gold)', padding: '0 0.3rem' }}>
                    CRITERIA
                  </legend>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                    {panel.criteria.map((c) => (
                      <div key={c.key} style={{ flex: '1 1 140px', minWidth: 0, display: 'flex' }}>
                        <ScoreInput
                          label={c.label.toUpperCase()}
                          max={c.max}
                          step={0.5}
                          value={panelScores[c.key] ?? ''}
                          allowBlank
                          onChange={(n) => setPanelScores((prev) => ({ ...prev, [c.key]: n }))}
                          disabled={!selectedId || submitting}
                        />
                      </div>
                    ))}
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.68rem', margin: '0.4rem 0 0' }}>
                    Score each criterion from 0 to its max, in steps of 0.5. The total is their sum; judges are averaged.
                  </p>
                </fieldset>
              )}

              {freestyle && (
                <>
                  <div style={{ marginBottom: '0.3rem' }}>
                    <ScoreInput
                      label="TECH EXECUTION"
                      sublabel={`(raw clicker → /${freestyle.techCap})`}
                      min={freestyle.negativeClicks ? -500 : 0}
                      max={500}
                      step={1}
                      value={techExecutionRaw}
                      onChange={setTechExecutionRaw}
                      disabled={!selectedId || submitting}
                    />
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.68rem', margin: '0 0 1rem' }}>
                    Enter your net clicker tally ({freestyle.negativeClicks ? '+ for landed elements, − for misses' : '+ for landed elements; this division uses no negative clicks'}).
                    It&rsquo;s normalized to /{freestyle.techCap} against your own highest score in this division once saved.
                    {multiplierNote && ` ${multiplierNote}`}
                  </p>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1rem' }}>
                    <ScoreInput label="TRICK PRES." max={freestyle.evalCap} value={trickPresentation} onChange={setTrickPresentation} disabled={!selectedId || submitting} />
                    <ScoreInput label="PERF. QUALITY" max={freestyle.evalCap} value={performanceQuality} onChange={setPerformanceQuality} disabled={!selectedId || submitting} />
                    <ScoreInput label="MUSICALITY" max={freestyle.evalCap} value={musicality} onChange={setMusicality} disabled={!selectedId || submitting} />
                    <ScoreInput label="ROUTINE CONSTR." max={freestyle.evalCap} value={routineConstruction} onChange={setRoutineConstruction} disabled={!selectedId || submitting} />
                  </div>

                  {deductions && (
                    <>
                      <div style={{ fontSize: '0.6rem', letterSpacing: '0.14em', fontWeight: 800, color: '#ff6b6b', marginBottom: '0.4rem' }}>
                        MAJOR DEDUCTIONS (count of each)
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1rem' }}>
                        <ScoreInput label="STOP" sublabel={`× −${deductions.stop}`} step={1} max={20} value={stopCount} onChange={setStopCount} disabled={!selectedId || submitting} accent="#ff6b6b" />
                        <ScoreInput label="DISCARD" sublabel={`× −${deductions.discard}`} step={1} max={20} value={discardCount} onChange={setDiscardCount} disabled={!selectedId || submitting} accent="#ff6b6b" />
                        <ScoreInput label="DETACH" sublabel={`× −${deductions.detach}`} step={1} max={20} value={detachCount} onChange={setDetachCount} disabled={!selectedId || submitting} accent="#ff6b6b" />
                      </div>
                    </>
                  )}
                </>
              )}

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
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }} aria-live="polite">
                  {preview && freestyle ? (
                    <>
                      Estimate: <span style={{ color: '#fff', fontFamily: 'monospace', fontWeight: 700 }}>
                        {preview.tech.toFixed(1)} + {preview.evalTotal.toFixed(1)}
                      </span>
                      {preview.ded > 0 && (
                        <span style={{ color: '#ff6b6b', fontFamily: 'monospace' }}> − {preview.ded.toFixed(1)}</span>
                      )}
                      {' = '}<span style={{ color: 'var(--gold)', fontFamily: 'monospace', fontWeight: 800 }}>{preview.final.toFixed(1)}</span>
                      <br />
                      <span style={{ fontSize: '0.72rem' }}>Tech Execution is normalized against your highest tally so far, so earlier scores shift as you go. My Scores shows the saved totals.</span>
                    </>
                  ) : panelPreview ? (
                    <>Total: <span style={{ color: 'var(--gold)', fontFamily: 'monospace', fontWeight: 800 }}>{panelPreview.total.toFixed(1)}</span> / {panelPreview.max}</>
                  ) : manual ? (
                    preview ? (
                      <>
                        {multiAttempt ? `Best (attempt ${bestIndex + 1}): ` : 'Score: '}
                        <span style={{ color: 'var(--gold)', fontFamily: 'monospace', fontWeight: 800 }}>{preview.final.toFixed(2)}</span> {manualUnit}
                        {lowerWins && ' · lower wins'}
                      </>
                    ) : <>No attempt entered yet{lowerWins ? ' · lower wins' : ''}</>
                  ) : null}
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
          )}
        </div>

        {usesScores && (
        <aside style={{ flex: '1 1 280px', minWidth: 0 }}>
          <section style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '1rem' }}>
            <div style={{ fontSize: '0.6rem', letterSpacing: '0.16em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.75rem' }}>
              MY SCORES ({division}{rounds.length > 1 ? ` · ${rounds[round - 1]?.name ?? `Round ${round}`}` : ''})
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
                    {(s.style_code || s.registered_styles?.length === 1) && (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem', marginBottom: '0.2rem' }}>
                        Style: {styleLabel(s.style_code ?? s.registered_styles[0])}
                      </div>
                    )}
                    {freestyle && (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: '0.2rem' }}>
                        TE {s.tech_execution_raw.toFixed(0)} raw → {s.tech_execution_normalized.toFixed(1)} | TP {s.trick_presentation.toFixed(1)} | PQ {s.performance_quality.toFixed(1)} | MU {s.musicality.toFixed(1)} | RC {s.routine_construction.toFixed(1)}
                        {s.deduction_points > 0 && (
                          <span style={{ color: '#ff6b6b' }}> | −{s.deduction_points.toFixed(1)}</span>
                        )}
                      </div>
                    )}
                    {panel && s.panel_scores && (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: '0.2rem' }}>
                        {panel.criteria.map((c) => `${c.label} ${Number(s.panel_scores?.[c.key] ?? 0).toFixed(1)}`).join(' | ')}
                      </div>
                    )}
                    {manual && s.manual_attempts && s.manual_attempts.length > 0 && (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: '0.2rem' }}>
                        Attempts: {s.manual_attempts.map((a) => (a === null ? '–' : a)).join(' | ')}
                      </div>
                    )}
                    <div style={{ color: 'var(--gold)', fontFamily: 'monospace', fontWeight: 800, fontSize: '0.92rem' }}>
                      {manual ? `${s.final_score.toFixed(2)} ${manualUnit}` : panel ? `${s.final_score.toFixed(1)} / ${panelMax(panel)}` : s.final_score.toFixed(1)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
        )}
        </>
        )}
      </main>
      )}
    </div>
  );
}
