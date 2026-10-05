/**
 * Pure helpers for the side-event tools (staff stopwatch / tap counter, the API's value checks).
 * Import-free so `npm test` can load it directly (lib/side-event-tools.test.mjs).
 */

/** Largest value a try may record (exclusive). Matches the API check. */
export const SIDE_VALUE_MAX = 100000;

/** Live stopwatch text, truncated (never rounded up) to tenths: "7.3", "1:05.3", "12:00.0". */
export function formatStopwatch(ms: number): string {
  const tenths = Math.max(0, Math.floor(ms / 100));
  const m = Math.floor(tenths / 600);
  const rest = tenths - m * 600;
  const s = Math.floor(rest / 10);
  const t = rest % 10;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}.${t}` : `${s}.${t}`;
}

/** Seconds to save for a stopwatch reading: the same tenths the screen showed. */
export function stopwatchSeconds(ms: number): number {
  return Math.max(0, Math.floor(ms / 100)) / 10;
}

/**
 * Parse a time typed by staff: "65.3", "65", "1:05.3", "1:05", "0:07.25". Returns seconds,
 * or null when it isn't a time. Up to 2 decimals.
 */
export function parseManualTime(input: string): number | null {
  const s = input.trim();
  const m = /^(?:(\d{1,4}):)?(\d{1,5})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const minutes = m[1] !== undefined ? Number(m[1]) : 0;
  const secs = Number(m[2]);
  if (m[1] !== undefined && (m[2].length !== 2 || secs >= 60)) return null;
  const frac = m[3] ? Number(m[3].padEnd(2, '0')) / 100 : 0;
  const total = Math.round((minutes * 60 + secs + frac) * 100) / 100;
  return isValidSideValue(total) ? total : null;
}

/** API rule: a finite number, ≥ 0, < 100000, with at most 2 decimals. */
export function isValidSideValue(v: unknown): v is number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v >= SIDE_VALUE_MAX) return false;
  const cents = v * 100;
  return Math.abs(cents - Math.round(cents)) < 1e-6;
}

/** Trim and collapse spaces in a typed name; null unless 1–60 characters remain. */
export function cleanSideName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const s = input.replace(/\s+/g, ' ').trim();
  return s.length >= 1 && s.length <= 60 ? s : null;
}

// ---------------------------------------------------------------- tap counter

/**
 * Tap counter. Without a time limit it is always counting ("open"). With one, taps count only
 * while "running"; a tick at or past `endsAt` moves it to "done" (TIME!).
 */
export interface CounterState {
  phase: 'open' | 'ready' | 'running' | 'done';
  count: number;
  /** performance.now() timestamp when a timed round ends */
  endsAt: number | null;
}

export type CounterAction =
  | { type: 'start'; now: number }
  | { type: 'tap'; now: number }
  | { type: 'undo' }
  | { type: 'tick'; now: number }
  | { type: 'reset' };

export function counterInit(timeLimitSeconds?: number): CounterState {
  return { phase: timeLimitSeconds ? 'ready' : 'open', count: 0, endsAt: null };
}

export function counterStep(state: CounterState, action: CounterAction, timeLimitSeconds?: number): CounterState {
  const timed = !!timeLimitSeconds && timeLimitSeconds > 0;
  switch (action.type) {
    case 'reset':
      return counterInit(timed ? timeLimitSeconds : undefined);
    case 'start':
      if (!timed || state.phase === 'running') return state;
      return { phase: 'running', count: 0, endsAt: action.now + timeLimitSeconds! * 1000 };
    case 'tick':
      if (state.phase === 'running' && state.endsAt !== null && action.now >= state.endsAt) {
        return { ...state, phase: 'done' };
      }
      return state;
    case 'tap': {
      if (state.phase === 'open') return { ...state, count: state.count + 1 };
      if (state.phase !== 'running') return state;
      // A tap that lands after the buzzer ends the round instead of counting.
      if (state.endsAt !== null && action.now >= state.endsAt) return { ...state, phase: 'done' };
      return { ...state, count: state.count + 1 };
    }
    case 'undo':
      if (state.count === 0 || state.phase === 'ready') return state;
      return { ...state, count: state.count - 1 };
  }
}

/** Whole seconds left in a timed round (rounded up, so it reads 60 … 1, then 0 at the buzzer). */
export function secondsLeft(state: CounterState, now: number): number {
  if (state.phase !== 'running' || state.endsAt === null) return 0;
  return Math.max(0, Math.ceil((state.endsAt - now) / 1000));
}
