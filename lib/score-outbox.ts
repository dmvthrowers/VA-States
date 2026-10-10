// Score outbox for the judge page: a score is saved on the judge's phone first, then sent. If the
// venue's connection drops, the score waits here and is sent when the signal comes back, so a dead
// spot never loses a score. The scores API upserts on (registration, division, round, judge), so
// sending the same score twice is safe. Pure functions over a Storage-like object; the page
// supplies localStorage. Holds registration ids and numbers only, never names or contact details.

export const OUTBOX_KEY = 'judge-score-outbox:v1';

export interface OutboxEntry {
  /** One entry per performer, division and round: a newer score replaces an unsent older one. */
  id: string;
  /** The request body for POST /api/scores. */
  body: Record<string, unknown> & { registration_id: string; division: string; round: number };
  /** When the judge pressed save (ms since epoch). */
  savedAt: number;
  /** Last send problem, shown to the judge; null until a send fails. */
  lastError: string | null;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function entryId(registrationId: string, division: string, round: number): string {
  return `${registrationId}|${division}|${round}`;
}

export function loadOutbox(storage: StorageLike | null | undefined): OutboxEntry[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(OUTBOX_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is OutboxEntry =>
        !!e && typeof e === 'object' && typeof (e as OutboxEntry).id === 'string' &&
        !!(e as OutboxEntry).body && typeof (e as OutboxEntry).savedAt === 'number',
    );
  } catch {
    return [];
  }
}

function save(storage: StorageLike | null | undefined, entries: OutboxEntry[]): OutboxEntry[] {
  if (storage) {
    try {
      storage.setItem(OUTBOX_KEY, JSON.stringify(entries));
    } catch {
      // Storage full or blocked (private mode): the in-memory list still works for this visit.
    }
  }
  return entries;
}

/** Add a score, replacing any unsent score for the same performer, division and round. */
export function enqueue(
  storage: StorageLike | null | undefined,
  body: OutboxEntry['body'],
  now: number = Date.now(),
): OutboxEntry[] {
  const id = entryId(body.registration_id, body.division, body.round);
  const rest = loadOutbox(storage).filter((e) => e.id !== id);
  return save(storage, [...rest, { id, body, savedAt: now, lastError: null }]);
}

/** Remove a sent score, but only if it hasn't been replaced by a newer one since it was read. */
export function markSent(storage: StorageLike | null | undefined, id: string, savedAt: number): OutboxEntry[] {
  return save(storage, loadOutbox(storage).filter((e) => !(e.id === id && e.savedAt === savedAt)));
}

export function markFailed(storage: StorageLike | null | undefined, id: string, error: string): OutboxEntry[] {
  return save(storage, loadOutbox(storage).map((e) => (e.id === id ? { ...e, lastError: error } : e)));
}

export type SendOutcome = 'sent' | 'retry' | 'rejected' | 'signed-out';

/**
 * What to do after a send attempt. `status` is the HTTP status, or null when the request never
 * reached the server (offline, timeout, DNS). Network trouble, timeouts, rate limits and server
 * errors are retried; a signed-out judge keeps the score until they sign in again; anything else
 * (a 4xx like a validation error) won't succeed on retry and is shown to the judge.
 */
export function classify(status: number | null): SendOutcome {
  if (status === null) return 'retry';
  if (status >= 200 && status < 300) return 'sent';
  if (status === 401 || status === 403) return 'signed-out';
  if (status === 408 || status === 425 || status === 429 || status >= 500) return 'retry';
  return 'rejected';
}

/** Oldest first, so scores reach the server in the order the judge entered them. */
export function sendOrder(entries: OutboxEntry[]): OutboxEntry[] {
  return [...entries].sort((a, b) => a.savedAt - b.savedAt);
}
