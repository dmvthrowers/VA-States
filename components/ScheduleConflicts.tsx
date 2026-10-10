'use client';

import { useEffect, useState } from 'react';

interface Conflict { kind: 'overlap' | 'tight'; sentence: string; players: { id: string; name: string }[] }

/** Players registered in two divisions that clash on the planned schedule (master plan D6). Read-only. */
export default function ScheduleConflicts({ token }: { token: string }) {
  const [gap, setGap] = useState(0);
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/schedule-conflicts?gap=${gap}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<{ conflicts: Conflict[] }>) : Promise.reject(new Error('bad response'))))
      .then((j) => { if (live) { setConflicts(j.conflicts); setFailed(false); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [token, gap]);

  return (
    <section aria-labelledby="schedule-conflicts" style={{ marginTop: '1.5rem', border: '1px solid var(--navy-border)', padding: '1rem', background: 'var(--navy)' }}>
      <h2 id="schedule-conflicts" style={{ color: 'var(--gold)', fontSize: '0.8rem', letterSpacing: '0.12em', margin: '0 0 0.5rem' }}>SCHEDULE CLASHES</h2>
      <label style={{ color: '#fff', fontSize: '0.8rem' }}>Also warn when blocks are less than{' '}
        <select value={gap} onChange={(e) => setGap(Number(e.target.value))} style={{ background: '#0d1428', color: '#fff', border: '1px solid var(--navy-border)', padding: '0.3rem' }}>
          {[0, 5, 10, 15, 30].map((m) => <option key={m} value={m}>{m === 0 ? 'no extra warning' : `${m} min apart`}</option>)}
        </select>
      </label>
      {failed && <p role="alert" style={{ color: '#ff6b6b', fontSize: '0.85rem' }}>Could not check the schedule. Reload and try again.</p>}
      {conflicts && conflicts.length === 0 && <p role="status" style={{ color: 'var(--gold-light)', fontSize: '0.85rem' }}>No player is booked into two blocks that clash.</p>}
      {conflicts && conflicts.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0.75rem 0 0', display: 'grid', gap: '0.6rem' }}>
          {conflicts.map((c, i) => (
            <li key={i} style={{ color: '#fff', fontSize: '0.85rem' }}>
              <strong style={{ color: c.kind === 'overlap' ? '#ff6b6b' : 'var(--gold-light)' }}>{c.kind === 'overlap' ? 'Overlap. ' : 'Tight. '}</strong>
              {c.sentence}
              <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem' }}>{c.players.map((p) => p.name).join(', ')}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
