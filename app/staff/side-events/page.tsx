'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import BracketStaffGate from '@/components/BracketStaffGate';
import { dayOf, type SideEventDef } from '@/contest.config';
import {
  counterInit, counterStep, formatStopwatch, parseManualTime, secondsLeft, stopwatchSeconds,
  type CounterAction, type CounterState,
} from '@/lib/side-event-tools';
import type { SideEntryRow } from '@/app/api/staff/side-events/route';

/**
 * Side-table tools (docs/FORMATS.md → Side events): a big stopwatch for timer events and a tap
 * counter for counter events, then save the try under a name. Any active staff role can record.
 * Type first name + last initial, especially for kids.
 */

const btn = (tone: 'gold' | 'outline' | 'red', big = false): React.CSSProperties => ({
  background: tone === 'gold' ? 'var(--gold)' : tone === 'red' ? 'var(--red)' : 'transparent',
  color: tone === 'gold' ? 'var(--navy-deep)' : '#fff',
  border: `1px solid ${tone === 'gold' ? 'var(--gold)' : tone === 'red' ? 'var(--red)' : 'var(--navy-border)'}`,
  padding: big ? '1.1rem 1.5rem' : '0.55rem 0.9rem', fontWeight: 800, fontSize: big ? '1.1rem' : '0.75rem',
  letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', touchAction: 'manipulation',
});
const bigNumber: React.CSSProperties = { fontFamily: 'monospace', fontWeight: 800, fontSize: 'clamp(3rem, 18vw, 6rem)', color: '#fff', textAlign: 'center', lineHeight: 1.1 };

/** Stopwatch: start / stop, shows tenths. Reports the reading in seconds once stopped. */
function Stopwatch({ onValue }: { onValue: (seconds: number | null) => void }) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => setElapsed(performance.now() - startedAt), 100);
    return () => clearInterval(id);
  }, [startedAt]);
  const running = startedAt !== null;
  return (
    <div>
      <div aria-live="off" style={bigNumber}>{formatStopwatch(elapsed)}</div>
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '0.75rem' }}>
        {running ? (
          <button type="button" style={btn('red', true)} onClick={() => {
            const ms = performance.now() - startedAt!;
            setStartedAt(null); setElapsed(ms); onValue(stopwatchSeconds(ms));
          }}>Stop</button>
        ) : (
          <button type="button" style={btn('gold', true)} onClick={() => { onValue(null); setElapsed(0); setStartedAt(performance.now()); }}>
            {elapsed > 0 ? 'Restart' : 'Start'}
          </button>
        )}
      </div>
    </div>
  );
}

/** Tap counter, optionally with a time limit (Start → taps count → TIME!). */
function Counter({ def, onValue }: { def: SideEventDef; onValue: (n: number | null) => void }) {
  const limit = def.timeLimitSeconds;
  const [state, dispatch] = useReducer(
    (s: CounterState, a: CounterAction) => counterStep(s, a, limit), undefined, () => counterInit(limit),
  );
  // Clock reading from the last tick; render reads this instead of the clock itself.
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    if (state.phase !== 'running') return;
    const id = setInterval(() => { const now = performance.now(); dispatch({ type: 'tick', now }); setNowMs(now); }, 200);
    return () => clearInterval(id);
  }, [state.phase]);
  useEffect(() => {
    onValue(state.phase === 'done' || (state.phase === 'open' && state.count > 0) ? state.count : null);
  }, [state.phase, state.count, onValue]);

  return (
    <div>
      {limit && (
        <div style={{ textAlign: 'center', fontWeight: 800, letterSpacing: '0.12em', color: state.phase === 'done' ? 'var(--red)' : 'var(--gold)' }}>
          {state.phase === 'ready' && `${limit} SECONDS · PRESS START`}
          {state.phase === 'running' && `${nowMs ? secondsLeft(state, nowMs) : limit}s LEFT`}
          {state.phase === 'done' && 'TIME!'}
        </div>
      )}
      <div style={bigNumber}>{state.count}</div>
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '0.75rem' }}>
        {state.phase === 'ready' && <button type="button" style={btn('gold', true)} onClick={() => dispatch({ type: 'start', now: performance.now() })}>Start</button>}
        {(state.phase === 'running' || state.phase === 'open') && (
          <button type="button" style={{ ...btn('gold', true), minWidth: '12rem', minHeight: '6rem', fontSize: '1.6rem' }}
            onClick={() => dispatch({ type: 'tap', now: performance.now() })}>+1</button>
        )}
        {state.count > 0 && state.phase !== 'ready' && <button type="button" style={btn('outline')} onClick={() => dispatch({ type: 'undo' })}>Undo</button>}
        <button type="button" style={btn('outline')} onClick={() => dispatch({ type: 'reset' })}>Reset</button>
      </div>
    </div>
  );
}

function EventPanel({ def, token }: { def: SideEventDef; token: string }) {
  const [measured, setMeasured] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [entries, setEntries] = useState<SideEntryRow[]>([]);
  const [toolKey, setToolKey] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);
  const onValue = useCallback((v: number | null) => setMeasured(v), []);

  const auth = { Authorization: `Bearer ${token}` };
  const load = useCallback(async () => {
    const res = await fetch(`/api/staff/side-events?code=${encodeURIComponent(def.code)}&limit=30`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }).catch(() => null);
    if (res?.ok) setEntries((await res.json()).entries);
  }, [def.code, token]);
  useEffect(() => { load(); }, [load]);

  const typedValue = typed.trim()
    ? (def.kind === 'timer' ? parseManualTime(typed) : (/^\d{1,5}$/.test(typed.trim()) ? Number(typed.trim()) : null))
    : null;
  const value = typed.trim() ? typedValue : measured;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (value === null || !name.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/staff/side-events', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ code: def.code, name, value }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg({ ok: true, text: `Saved ${json.entry.name}: ${value} ${def.unit}.` });
        setName(''); setTyped(''); setMeasured(null); setToolKey((k) => k + 1);
        load();
      } else setMsg({ ok: false, text: json?.error?.message ?? 'That did not save.' });
    } catch { setMsg({ ok: false, text: 'Network error. The try is still here; save again.' }); }
    finally { setBusy(false); }
  }

  async function toggleHidden(row: SideEntryRow) {
    const res = await fetch('/api/staff/side-events', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ id: row.id, hidden: !row.hidden }),
    }).catch(() => null);
    if (res?.ok) load(); else setMsg({ ok: false, text: 'Could not change that try.' });
  }

  const label: React.CSSProperties = { display: 'block', fontSize: '0.6rem', letterSpacing: '0.16em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.4rem' };
  const input: React.CSSProperties = { width: '100%', padding: '0.7rem', background: '#0d1428', border: '1px solid var(--navy-border)', color: '#fff', fontSize: '1rem', boxSizing: 'border-box' };

  return (
    <section style={{ border: '1px solid var(--navy-border)', background: 'var(--navy)', padding: '1.25rem' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 1rem' }}>{def.description}</p>
      {def.kind === 'timer'
        ? <Stopwatch key={toolKey} onValue={onValue} />
        : <Counter key={toolKey} def={def} onValue={onValue} />}

      <form onSubmit={save} style={{ display: 'grid', gap: '0.75rem', marginTop: '1.5rem' }}>
        <div>
          <label htmlFor={`name-${def.code}`} style={label}>NAME (FIRST NAME + LAST INITIAL)</label>
          <input id={`name-${def.code}`} ref={nameRef} value={name} maxLength={60} autoComplete="off" onChange={(e) => setName(e.target.value)} style={input} placeholder="Sam R." />
        </div>
        <div>
          <label htmlFor={`typed-${def.code}`} style={label}>OR TYPE THE {def.kind === 'timer' ? 'TIME' : 'COUNT'}</label>
          <input id={`typed-${def.code}`} value={typed} inputMode="decimal" autoComplete="off" onChange={(e) => setTyped(e.target.value)} style={input}
            placeholder={def.kind === 'timer' ? '1:05.3 or 65.3' : '42'} aria-invalid={!!typed.trim() && typedValue === null} />
          {!!typed.trim() && typedValue === null && <p role="alert" style={{ color: '#ff6b6b', fontSize: '0.8rem', margin: '0.3rem 0 0' }}>That isn&rsquo;t a {def.kind === 'timer' ? 'time' : 'whole number'}.</p>}
        </div>
        <button type="submit" disabled={busy || value === null || !name.trim()} style={{ ...btn('gold'), opacity: busy || value === null || !name.trim() ? 0.5 : 1 }}>
          {value === null ? 'Measure or type a value' : `Save ${value} ${def.unit}`}
        </button>
        <p role="status" aria-live="polite" style={{ margin: 0, fontSize: '0.85rem', minHeight: '1.2rem', color: msg ? (msg.ok ? 'var(--gold-light)' : '#ff6b6b') : 'transparent' }}>{msg?.text ?? ''}</p>
      </form>

      <h3 style={{ fontSize: '0.7rem', letterSpacing: '0.14em', color: 'var(--gold)', margin: '1rem 0 0.5rem' }}>RECENT TRIES</h3>
      {entries.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>None yet.</p> : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {entries.map((r) => (
            <li key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0', borderBottom: '1px solid var(--navy-border)', opacity: r.hidden ? 0.5 : 1 }}>
              <span style={{ color: '#fff', textDecoration: r.hidden ? 'line-through' : 'none', overflowWrap: 'anywhere' }}>{r.name} · {r.value} {def.unit}</span>
              <button type="button" style={btn('outline')} onClick={() => toggleHidden(r)}>{r.hidden ? 'Restore' : 'Hide'}</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function StaffSideEventsPage() {
  const [code, setCode] = useState(dayOf.sideEvents[0]?.code ?? '');
  const def = dayOf.sideEvents.find((e) => e.code === code);
  return (
    <BracketStaffGate title="Side Events" roles={['admin', 'dj', 'audio_tech', 'judge']}>
      {({ token }) => (
        <main id="main-content" style={{ maxWidth: 560, margin: '0 auto', padding: '2rem 1rem', minHeight: '100vh', background: 'var(--navy-deep)' }}>
          <h1 style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.6rem', margin: '0 0 1rem' }}>Side Events</h1>
          {dayOf.sideEvents.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No side events are set up in contest.config.ts.</p> : (
            <>
              <div role="tablist" aria-label="Side event" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                {dayOf.sideEvents.map((e) => (
                  <button key={e.code} type="button" role="tab" aria-selected={e.code === code} style={btn(e.code === code ? 'gold' : 'outline')} onClick={() => setCode(e.code)}>{e.name}</button>
                ))}
              </div>
              {def && <EventPanel key={def.code} def={def} token={token} />}
              <p style={{ margin: '1rem 0 0', fontSize: '0.8rem' }}>
                <a href="/side-events" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold-light)' }}>Public leaderboards ↗</a>
                {def && <>{' · '}<a href={`/overlay/side-event?code=${encodeURIComponent(def.code)}&bg=1`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold-light)' }}>Stream overlay ↗</a></>}
              </p>
            </>
          )}
        </main>
      )}
    </BracketStaffGate>
  );
}
