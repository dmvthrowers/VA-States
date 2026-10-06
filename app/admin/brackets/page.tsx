'use client';

import { useState } from 'react';
import BracketView, { BracketPlacements, type BracketData } from '@/components/BracketView';
import BracketStaffGate from '@/components/BracketStaffGate';
import { competition } from '@/contest.config';
import { formatSummary } from '@/lib/divisions-core';

const BRACKET_DIVISIONS = competition.divisions.filter((d) => d.scoring.format === 'bracket');

const btn = (tone: 'gold' | 'outline' | 'red'): React.CSSProperties => ({
  background: tone === 'gold' ? 'var(--gold)' : tone === 'red' ? 'var(--red)' : 'transparent',
  color: tone === 'gold' ? 'var(--navy-deep)' : '#fff',
  border: `1px solid ${tone === 'gold' ? 'var(--gold)' : tone === 'red' ? 'var(--red)' : 'var(--navy-border)'}`,
  padding: '0.5rem 0.9rem', fontWeight: 800, fontSize: '0.75rem', letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
});

function DivisionPanel({ code, token }: { code: string; token: string }) {
  const def = BRACKET_DIVISIONS.find((d) => d.code === code)!;
  const [data, setData] = useState<BracketData | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(action: 'generate' | 'reset') {
    const exists = (data?.matches.length ?? 0) > 0;
    const decided = data?.matches.some((m) => m.winner && m.entry_a && m.entry_b) ?? false;
    const question = action === 'reset'
      ? `Reset the ${def.name} bracket? Every match, result and vote is deleted.`
      : exists
        ? `Redraw the ${def.name} bracket from the current paid entrants? The old draw${decided ? ' AND ITS RESULTS' : ''} will be replaced.`
        : `Draw the ${def.name} bracket from the current paid entrants?`;
    if (!window.confirm(question)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/bracket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ division: code, action, force: action === 'generate' && decided }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setMsg({ ok: true, text: action === 'reset' ? 'Bracket cleared.' : `Bracket drawn with ${json.entrants} entrants.` });
      else setMsg({ ok: false, text: json?.error?.message ?? 'That did not work.' });
    } catch {
      setMsg({ ok: false, text: 'Network error.' });
    } finally {
      setBusy(false);
      setRefreshKey((k) => k + 1);
    }
  }

  const exists = (data?.matches.length ?? 0) > 0;
  return (
    <section aria-labelledby={`div-${code}`} style={{ marginBottom: '2.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <div>
          <h2 id={`div-${code}`} style={{ fontFamily: "'Playfair Display', serif", color: '#fff', fontSize: '1.3rem', margin: 0 }}>{def.name}</h2>
          <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{formatSummary(def)}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" disabled={busy} style={btn('gold')} onClick={() => run('generate')}>{exists ? 'Redraw' : 'Generate'}</button>
          {exists && <button type="button" disabled={busy} style={btn('outline')} onClick={() => run('reset')}>Reset</button>}
          <a href={`/results/bracket?division=${encodeURIComponent(code)}`} target="_blank" rel="noopener noreferrer" style={{ ...btn('outline'), textDecoration: 'none' }}>Public view ↗</a>
        </div>
      </div>
      <p role="status" aria-live="polite" style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', minHeight: '1.2rem', color: msg ? (msg.ok ? 'var(--gold-light)' : '#ff6b6b') : 'transparent' }}>{msg?.text ?? ''}</p>
      <div style={{ display: 'grid', gap: '1.25rem' }}>
        <BracketView division={code} token={token} mode="admin" refreshKey={refreshKey} onData={setData} />
        <div>
          <h3 style={{ fontFamily: 'var(--font-condensed)', fontSize: '0.8rem', letterSpacing: 'var(--caps-track)', textTransform: 'uppercase', color: 'var(--gold)', margin: '0 0 0.5rem' }}>Placements</h3>
          <BracketPlacements placements={data?.placements ?? []} />
        </div>
      </div>
    </section>
  );
}

export default function AdminBracketsPage() {
  return (
    <BracketStaffGate title="Battle Brackets" roles={['admin']} landmark={false}>
      {({ token }) => (
        <div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.6rem', margin: '0 0 0.25rem' }}>Battle Brackets</h1>
          <p style={{ color: 'var(--text-muted)', margin: '0 0 2rem', fontSize: '0.85rem' }}>
            Draw each bracket once registration closes. Tap a match to run it: set it live, then confirm the winner.
          </p>
          {BRACKET_DIVISIONS.length === 0
            ? <p style={{ color: 'var(--text-muted)' }}>This contest has no battle divisions.</p>
            : BRACKET_DIVISIONS.map((d) => <DivisionPanel key={d.code} code={d.code} token={token} />)}
        </div>
      )}
    </BracketStaffGate>
  );
}
