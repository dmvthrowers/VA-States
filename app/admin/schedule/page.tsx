'use client';

import { useState } from 'react';
import BracketStaffGate from '@/components/BracketStaffGate';
import { ScheduleList, useScheduleFeed } from '@/components/ScheduleView';
import type { FeedItem } from '@/lib/schedule-feed-core';
import type { ScheduleAction } from '@/lib/schedule-core';

/**
 * Day-of schedule controls (docs/FORMATS.md → Live schedule). A judged block goes
 * Start → Close judging → Publish results; any other block goes Start → Done. Publishing
 * makes that division's results public right away. Admins, DJs, audio techs and judges can run it.
 */

const btn = (tone: 'gold' | 'outline' | 'red'): React.CSSProperties => ({
  background: tone === 'gold' ? 'var(--gold)' : tone === 'red' ? 'var(--red)' : 'transparent',
  color: tone === 'gold' ? 'var(--navy-deep)' : '#fff',
  border: `1px solid ${tone === 'gold' ? 'var(--gold)' : tone === 'red' ? 'var(--red)' : 'var(--navy-border)'}`,
  padding: '0.5rem 0.9rem', fontWeight: 800, fontSize: '0.75rem', letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
});

function actionsFor(i: FeedItem): { action: ScheduleAction; label: string; tone: 'gold' | 'outline' | 'red' }[] {
  const judged = !!i.division;
  switch (i.status) {
    case 'upcoming': return [{ action: 'start', label: 'Start', tone: 'red' }];
    case 'live': return judged
      ? [{ action: 'close_judging', label: 'Close judging', tone: 'gold' }, { action: 'reset', label: 'Reset', tone: 'outline' }]
      : [{ action: 'done', label: 'Done', tone: 'gold' }, { action: 'reset', label: 'Reset', tone: 'outline' }];
    case 'judging': return [
      { action: 'publish', label: 'Publish results', tone: 'gold' },
      { action: 'done', label: 'Done, publish later', tone: 'outline' },
      { action: 'reset', label: 'Reset', tone: 'outline' },
    ];
    case 'done': return [
      ...(judged && !i.results_published ? [{ action: 'publish' as const, label: 'Publish results', tone: 'gold' as const }] : []),
      { action: 'reset', label: 'Reset', tone: 'outline' },
    ];
  }
}

function Controls({ token }: { token: string }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const { feed, setFeed, error } = useScheduleFeed('/api/admin/schedule', 10000, token, refreshKey);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(i: FeedItem, action: ScheduleAction, label: string) {
    if (action === 'reset' && !window.confirm(`Reset "${i.title}"? Its times are cleared${i.results_published ? ' and its published results go hidden again' : ''}.`)) return;
    if (action === 'publish' && !window.confirm(`Publish ${i.title} results? They go public right away.`)) return;
    setBusy(i.id);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ item_id: i.id, action }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) { setFeed(json); setMsg({ ok: true, text: `${i.title}: ${label}.` }); }
      else { setMsg({ ok: false, text: json?.error?.message ?? 'That did not work.' }); setRefreshKey((k) => k + 1); }
    } catch {
      setMsg({ ok: false, text: 'Network error. Check your connection and try again.' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h1 style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.6rem', margin: '0 0 0.25rem' }}>Run the Day</h1>
      <p style={{ color: 'var(--text-muted)', margin: '0 0 0.5rem', fontSize: '0.85rem' }}>
        Start each block as it begins. For a division: close judging when the last competitor finishes, then publish once scores are checked. Later times move on their own.
      </p>
      <p style={{ margin: '0 0 1rem', fontSize: '0.8rem' }}>
        <a href="/schedule" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold-light)' }}>Public schedule ↗</a>
        {' · '}
        <a href="/admin/run-order" style={{ color: 'var(--gold-light)' }}>Run order</a>
        {' · '}
        <a href="/overlay/schedule?bg=1" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold-light)' }}>Stream overlay ↗</a>
      </p>
      <p role="status" aria-live="polite" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', minHeight: '1.2rem', color: msg ? (msg.ok ? 'var(--gold-light)' : '#ff6b6b') : 'transparent' }}>{msg?.text ?? ''}</p>
      {error && !feed && <p role="alert" style={{ color: '#ff6b6b' }}>The schedule didn&rsquo;t load. Retrying…</p>}
      {feed && (
        <ScheduleList
          feed={feed}
          actions={(i) => (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {actionsFor(i).map((a) => (
                <button key={a.action} type="button" disabled={busy !== null} style={btn(a.tone)} onClick={() => run(i, a.action, a.label)}>
                  {busy === i.id ? '…' : a.label}
                </button>
              ))}
            </div>
          )}
        />
      )}
    </div>
  );
}

export default function AdminSchedulePage() {
  return (
    <BracketStaffGate title="Run the Day" roles={['admin', 'dj', 'audio_tech', 'judge']} landmark={false}>
      {({ token }) => <Controls token={token} />}
    </BracketStaffGate>
  );
}
