'use client';

import { useCallback, useEffect, useState } from 'react';

interface DivisionStatus { code: string; slot: string; name: string; entrants: number; own: number; fallback: number; empty: number }
interface MusicStatus {
  deadline_label: string;
  deadline_passed: boolean;
  pool_size: number | null;
  divisions: DivisionStatus[];
}
interface ReminderResult {
  dry_run: boolean; recipients: number; lofi_fallback: boolean; queued: number; skipped: number;
  people: { name: string; missing: string[] }[];
}
interface FallbackResult {
  dry_run: boolean; pool_size: number; empty_slots: number; assigned: number;
  slots: { name: string; division: string; slot: string; label: string; track: string }[];
}

/** Admin tab: music slots per division, reminder emails and the lo-fi fallback. */
export default function MusicManager({ token }: { token: string }) {
  const [status, setStatus] = useState<MusicStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [reminders, setReminders] = useState<ReminderResult | null>(null);
  const [fallback, setFallback] = useState<FallbackResult | null>(null);
  const [force, setForce] = useState(false);
  const [message, setMessage] = useState('');

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/music-status', { headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body?.error?.message ?? 'Could not load music status.'); return; }
      setError('');
      setStatus(body as MusicStatus);
    } catch {
      setError('Network error.');
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function post<T>(path: string, payload: object, key: string): Promise<T | null> {
    setBusy(key);
    setMessage('');
    try {
      const res = await fetch(path, { method: 'POST', headers, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage(body?.error?.message ?? 'That did not work.'); return null; }
      return body as T;
    } catch {
      setMessage('Network error.');
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function previewReminders() {
    setReminders(await post<ReminderResult>('/api/admin/music-reminders', { dry_run: true }, 'reminders-preview'));
  }
  async function sendReminders() {
    if (!reminders || !confirm(`Email ${reminders.recipients} ${reminders.recipients === 1 ? 'person' : 'people'} a music reminder?`)) return;
    const r = await post<ReminderResult>('/api/admin/music-reminders', { dry_run: false }, 'reminders-send');
    if (r) {
      setReminders(r);
      setMessage(`Reminders queued: ${r.queued}${r.skipped ? `, ${r.skipped} already sent today` : ''}.`);
    }
  }
  async function previewFallback() {
    setFallback(await post<FallbackResult>('/api/admin/music-fallback', { dry_run: true }, 'fallback-preview'));
  }
  async function assignFallback() {
    if (!fallback || !confirm(`Give ${fallback.empty_slots} empty slot${fallback.empty_slots === 1 ? '' : 's'} a lo-fi track?`)) return;
    const r = await post<FallbackResult>('/api/admin/music-fallback', { dry_run: false, force }, 'fallback-assign');
    if (r) {
      setFallback(r);
      setMessage(`Lo-fi tracks assigned: ${r.assigned}.`);
      void load();
    }
  }

  const btn = 'border border-navy-border px-3 py-2 text-xs font-black tracking-caps text-text-body hover:text-white disabled:opacity-50';
  const btnGold = 'bg-gold text-navy-deep px-3 py-2 text-xs font-black tracking-caps disabled:opacity-50';

  return (
    <div>
      <h2 className="font-display text-2xl text-gold font-bold m-0 mb-1">Music</h2>
      {status && (
        <p className="text-sm text-text-body mt-0 mb-4">
          Deadline: <span className="text-white">{status.deadline_label}</span>
          {status.deadline_passed ? ' (passed)' : ''} · Lo-fi pool: <span className="text-white">{status.pool_size ?? 'unknown'}</span> track{status.pool_size === 1 ? '' : 's'}
        </p>
      )}
      {error && <p role="alert" className="text-[#ff6b6b] text-sm">{error}</p>}
      {message && <p role="status" className="text-sm text-white border border-navy-border bg-navy-deep p-2 mb-4">{message}</p>}

      <h3 className="text-xs font-black tracking-caps text-gold mb-2">TRACKS · ONE PER DIVISION AND SLOT</h3>
      <div className="overflow-x-auto mb-8">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-navy-border text-left text-xs uppercase tracking-wide text-text-muted">
              <th className="py-2 pr-3">Track</th><th className="py-2 pr-3">Entrants</th>
              <th className="py-2 pr-3">Uploaded</th><th className="py-2 pr-3">Lo-fi</th><th className="py-2 pr-3">Empty</th>
            </tr>
          </thead>
          <tbody>
            {(status?.divisions ?? []).map((d) => (
              <tr key={`${d.code}:${d.slot}`} className="border-b border-navy-border">
                <td className="py-2 pr-3 text-white">{d.name}</td>
                <td className="py-2 pr-3">{d.entrants}</td>
                <td className="py-2 pr-3 text-[#7fff7f]">{d.own}</td>
                <td className="py-2 pr-3 text-gold">{d.fallback}</td>
                <td className={`py-2 pr-3 ${d.empty ? 'text-[#ff6b6b] font-bold' : ''}`}>{d.empty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="text-xs font-black tracking-caps text-gold mb-2">REMINDER EMAILS</h3>
      <p className="text-sm text-text-body mt-0">
        Emails everyone with an empty slot the tracks they still need and their upload link. Once a day at most per person. Before the deadline only.
      </p>
      <div className="flex gap-2 flex-wrap mb-3">
        <button type="button" className={btn} disabled={busy !== null} onClick={previewReminders}>
          {busy === 'reminders-preview' ? 'Checking…' : 'Preview who gets one'}
        </button>
        {reminders && reminders.dry_run && reminders.recipients > 0 && (
          <button type="button" className={btnGold} disabled={busy !== null || !!status?.deadline_passed} onClick={sendReminders}>
            {busy === 'reminders-send' ? 'Queuing…' : `Send ${reminders.recipients} reminder${reminders.recipients === 1 ? '' : 's'}`}
          </button>
        )}
      </div>
      {reminders && (
        <ul className="text-sm text-text-body mb-8 pl-5">
          {reminders.people.length === 0 && <li>Nobody has an empty slot.</li>}
          {reminders.people.map((p) => <li key={p.name}>{p.name}: {p.missing.join(', ')}</li>)}
          {reminders.people.length > 0 && !reminders.lofi_fallback && (
            <li className="text-gold">No lo-fi pool yet, so the email says unfilled routines get no music.</li>
          )}
        </ul>
      )}

      <h3 className="text-xs font-black tracking-caps text-gold mb-2">LO-FI FALLBACK</h3>
      <p className="text-sm text-text-body mt-0">
        Gives every empty slot a random track from the lo-fi pool (the <code>lofi/</code> folder of the <code>vsyc26-music</code> bucket), shown as LO-FI (no upload) on the DJ queue and the player&rsquo;s page. A player&rsquo;s own upload replaces it. Never touches a slot that has a track.
      </p>
      <div className="flex gap-2 flex-wrap items-center mb-3">
        <button type="button" className={btn} disabled={busy !== null} onClick={previewFallback}>
          {busy === 'fallback-preview' ? 'Checking…' : 'Preview assignment'}
        </button>
        {fallback && fallback.dry_run && fallback.empty_slots > 0 && (
          <>
            {status && !status.deadline_passed && (
              <label className="text-xs text-text-body flex items-center gap-2">
                <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="w-4 h-4 accent-gold" />
                The deadline hasn&rsquo;t passed: assign anyway
              </label>
            )}
            <button type="button" className={btnGold} disabled={busy !== null || (!!status && !status.deadline_passed && !force)} onClick={assignFallback}>
              {busy === 'fallback-assign' ? 'Assigning…' : `Assign ${fallback.empty_slots} lo-fi track${fallback.empty_slots === 1 ? '' : 's'}`}
            </button>
          </>
        )}
      </div>
      {fallback && (
        <ul className="text-sm text-text-body pl-5">
          {fallback.slots.length === 0 && <li>No empty slots.</li>}
          {fallback.slots.map((s) => <li key={`${s.name}:${s.division}:${s.slot}`}>{s.name} · {s.label} → {s.track}</li>)}
        </ul>
      )}
    </div>
  );
}
