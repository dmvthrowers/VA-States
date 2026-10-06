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

interface ScoreReport {
  division: string;
  round_name: string;
  judges: string[];
  entrants: { registration_id: string; name: string; scores: { judge_name: string; score: number }[]; missing_judges: string[]; median: number | null; spread: number | null }[];
  complete: number;
  blockers: string[];
  warnings: string[];
  ready: boolean;
}

/** The score status for a judged block, or null when it can't be read (not an admin or judge, or a network error). */
async function loadReport(token: string, i: FeedItem): Promise<ScoreReport | null> {
  if (!i.division) return null;
  try {
    const res = await fetch(`/api/admin/score-status?division=${encodeURIComponent(i.division)}&round=${i.round ?? 1}`, { headers: { Authorization: `Bearer ${token}` } });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

function Controls({ token }: { token: string }) {
  const [report, setReport] = useState<{ title: string; data: ScoreReport } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { feed, setFeed, error } = useScheduleFeed('/api/admin/schedule', 10000, token, refreshKey);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function check(i: FeedItem) {
    setBusy(i.id);
    setMsg(null);
    const data = await loadReport(token, i);
    setBusy(null);
    if (data) setReport({ title: i.title, data });
    else setMsg({ ok: false, text: 'Score status is for admins and judges, or it could not load.' });
  }

  async function run(i: FeedItem, action: ScheduleAction, label: string) {
    if (action === 'reset' && !window.confirm(`Reset "${i.title}"? Its times are cleared${i.results_published ? ' and its published results go hidden again' : ''}.`)) return;
    if (action === 'publish') {
      // Check the scores first: say what's missing or odd before the results go public.
      const r = await loadReport(token, i);
      const issues = r ? [...r.blockers.map((b) => `Not ready: ${b}`), ...r.warnings.map((w) => `Check: ${w}`)] : [];
      const lead = issues.length ? `${issues.slice(0, 6).join('\n')}${issues.length > 6 ? `\n…and ${issues.length - 6} more` : ''}\n\n` : '';
      if (!window.confirm(`${lead}Publish ${i.title} results? They go public right away.`)) return;
    }
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
      {report && (
        <section aria-label="Score status" style={{ border: '1px solid var(--navy-border)', background: 'var(--navy)', padding: '1rem', margin: '0 0 1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <strong style={{ color: report.data.ready ? 'var(--gold-light)' : '#ff6b6b' }}>
              {report.title}: {report.data.ready ? 'ready to publish' : 'not ready'} · {report.data.complete}/{report.data.entrants.length} fully scored · judges: {report.data.judges.join(', ') || 'none yet'}
            </strong>
            <button type="button" style={btn('outline')} onClick={() => setReport(null)}>Close</button>
          </div>
          {report.data.blockers.length > 0 && <ul style={{ color: '#ff6b6b', margin: '0.5rem 0 0', paddingLeft: '1.2rem', fontSize: '0.85rem' }}>{report.data.blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
          {report.data.warnings.length > 0 && <ul style={{ color: 'var(--gold-light)', margin: '0.5rem 0 0', paddingLeft: '1.2rem', fontSize: '0.85rem' }}>{report.data.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
          <div style={{ overflowX: 'auto', marginTop: '0.75rem' }}>
            <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', color: 'var(--text-body)' }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}><th>Competitor</th><th>Scores</th><th>Median</th><th>Spread</th><th>Missing</th></tr></thead>
              <tbody>
                {report.data.entrants.map((e) => (
                  <tr key={e.registration_id} style={{ borderTop: '1px solid var(--navy-border)' }}>
                    <td style={{ padding: '0.3rem 0.5rem 0.3rem 0' }}>{e.name}</td>
                    <td>{e.scores.map((x) => `${x.judge_name} ${x.score}`).join(' · ') || '—'}</td>
                    <td>{e.median ?? '—'}</td>
                    <td>{e.spread ?? '—'}</td>
                    <td style={{ color: e.missing_judges.length ? '#ff6b6b' : undefined }}>{e.missing_judges.join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {error && !feed && <p role="alert" style={{ color: '#ff6b6b' }}>The schedule didn&rsquo;t load. Retrying…</p>}
      {feed && (
        <ScheduleList
          feed={feed}
          actions={(i) => (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {i.division && i.status !== 'upcoming' && (
                <button type="button" disabled={busy !== null} style={btn('outline')} onClick={() => check(i)}>Check scores</button>
              )}
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
